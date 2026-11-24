import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asUser, db, seedCompany } from './fixtures';
import { applyLeave, balancesFor, decideLeave, yearlyRollover } from '@/server/services/leave';
import { applyRegularisation, decideRegularisation } from '@/server/services/regularisation';
import { finaliseDay, hrCorrect, recordPunch, attendanceRange } from '@/server/services/attendance';
import { setEmployeeRoles, setEmployeeStatus, updateEmployee } from '@/server/services/employees';
import { decideExpense, reimburseExpense, submitExpense } from '@/server/services/expenses';
import { approvalsInbox } from '@/server/services/approvals';
import { payslipFor } from '@/server/services/payroll';
import { enrolFace, matchFace, withdrawFace, FACE_CONSENT_VERSION } from '@/server/services/face';
import { kioskDisplay, registerKiosk, resolveKioskCode, revokeKiosk } from '@/server/services/kiosk';
import { purgeOldCoordinates } from '@/server/services/privacy';
import { ForbiddenError, UserError } from '@/server/errors';
import { addDays, businessDate, istInstant, toDbDate, fromDbDate } from '@/lib/dates';
import { isWeekend } from '@/lib/dates';

let c: Awaited<ReturnType<typeof seedCompany>>;
beforeEach(async () => {
  c = await seedCompany();
});
afterAll(async () => {
  await db.$disconnect();
});

/** The next working day (Mon–Fri) on or after d. */
function weekday(d: string, dir = 1) {
  while (isWeekend(d)) d = addDays(d, dir);
  return d;
}
const year = Number(businessDate().slice(0, 4));
// A future working week inside this calendar year, safely away from today.
const futureMon = (() => {
  let d = `${year}-12-07`;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d > businessDate() ? d : weekday(addDays(businessDate(), 7));
})();

describe('leave', () => {
  it('approval by the manager deducts the balance in the same transaction', async () => {
    const asha = await asUser(c.A.id);
    const req = await applyLeave(asha, {
      type: 'CL',
      from: futureMon,
      to: addDays(futureMon, 1),
      reason: 'Family',
    });
    expect(req.days).toBe(2);
    let cl = (await balancesFor(c.A.id, Number(futureMon.slice(0, 4)))).find((b) => b.code === 'CL')!;
    expect(cl).toMatchObject({ used: 0, pending: 2, available: 10 });
    await decideLeave(await asUser(c.M.id), req.id, true, '');
    cl = (await balancesFor(c.A.id, Number(futureMon.slice(0, 4)))).find((b) => b.code === 'CL')!;
    expect(cl).toMatchObject({ used: 2, pending: 0, remaining: 10 });
    expect(await db.auditLog.count({ where: { action: 'leave.approve', entityId: req.id } })).toBe(1);
  });

  it('never lets the requester or an unrelated manager decide', async () => {
    const asha = await asUser(c.A.id);
    const req = await applyLeave(asha, { type: 'CL', from: futureMon, to: futureMon, reason: 'x' });
    await expect(decideLeave(asha, req.id, true, '')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideLeave(await asUser(c.F.id), req.id, true, '')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideLeave(await asUser(c.H.id), req.id, false, '')).rejects.toThrow(/reason/);
    await decideLeave(await asUser(c.H.id), req.id, false, 'Busy week');
  });

  it('blocks approving a request that exceeds the balance', async () => {
    const asha = await asUser(c.A.id);
    const y = Number(futureMon.slice(0, 4));
    const req = await applyLeave(asha, {
      type: 'CL',
      from: futureMon,
      to: addDays(futureMon, 2),
      reason: 'Trip',
    });
    await db.leaveBalance.update({
      where: { employeeId_leaveTypeCode_year: { employeeId: c.A.id, leaveTypeCode: 'CL', year: y } },
      data: { used: 10 },
    });
    await expect(decideLeave(await asUser(c.M.id), req.id, true, '')).rejects.toThrow(
      /Not enough CL balance/,
    );
  });

  it('rejects overlapping requests and requests over the available balance', async () => {
    const asha = await asUser(c.A.id);
    await applyLeave(asha, { type: 'CL', from: futureMon, to: addDays(futureMon, 1), reason: 'a' });
    await expect(
      applyLeave(asha, { type: 'EL', from: addDays(futureMon, 1), to: addDays(futureMon, 2), reason: 'b' }),
    ).rejects.toThrow(/already have leave/);
    await expect(
      applyLeave(asha, { type: 'CL', from: addDays(futureMon, 7), to: addDays(futureMon, 25), reason: 'c' }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it('carries forward at most the configured days at year end', async () => {
    await db.leaveBalance.create({
      data: { employeeId: c.A.id, leaveTypeCode: 'EL', year: 2030, opening: 0, accrued: 15, used: 3 },
    });
    await db.leaveBalance.create({
      data: { employeeId: c.A.id, leaveTypeCode: 'CL', year: 2030, opening: 0, accrued: 12, used: 1 },
    });
    await yearlyRollover(2031);
    const el = await db.leaveBalance.findUniqueOrThrow({
      where: { employeeId_leaveTypeCode_year: { employeeId: c.A.id, leaveTypeCode: 'EL', year: 2031 } },
    });
    const cl = await db.leaveBalance.findUniqueOrThrow({
      where: { employeeId_leaveTypeCode_year: { employeeId: c.A.id, leaveTypeCode: 'CL', year: 2031 } },
    });
    expect(el).toMatchObject({ opening: 5, accrued: 15, used: 0 });
    expect(cl).toMatchObject({ opening: 0, accrued: 12 });
  });
});

describe('attendance', () => {
  const past = weekday(addDays(businessDate(), -7), -1);

  it('records IN then OUT, then refuses a third punch', async () => {
    const asha = await asUser(c.A.id);
    const at = istInstant(past, '09:50');
    const r1 = await recordPunch(asha, { method: 'WEB' }, at);
    expect(r1.direction).toBe('IN');
    expect(r1.day?.status).toBe('LATE');
    const r2 = await recordPunch(asha, { method: 'WEB' }, istInstant(past, '12:00'));
    expect(r2.direction).toBe('OUT');
    expect(r2.day?.status).toBe('SHORT');
    await expect(recordPunch(asha, { method: 'WEB' }, istInstant(past, '18:00'))).rejects.toThrow(
      /already checked in and out/,
    );
  });

  it('the nightly job marks absent anyone with no punch and no leave', async () => {
    await recordPunch(await asUser(c.A.id), { method: 'WEB' }, istInstant(past, '09:20'));
    const counts = await finaliseDay(past);
    expect(counts.ABSENT).toBe(6);
    expect(counts.PRESENT).toBe(1);
    const b = await db.attendanceDay.findUniqueOrThrow({
      where: { employeeId_businessDate: { employeeId: c.B.id, businessDate: toDbDate(past) } },
    });
    expect(b.status).toBe('ABSENT');
    expect(b.finalised).toBe(true);
  });

  it('HR corrections write method HR and appear in the audit log', async () => {
    await finaliseDay(past);
    const day = await hrCorrect(await asUser(c.H.id), {
      employeeId: c.B.id,
      date: past,
      inTime: '09:30',
      outTime: '18:30',
      reason: 'Badge reader down',
    });
    expect(day?.status).toBe('PRESENT');
    expect(day?.inMethod).toBe('HR');
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'attendance.correct' } });
    expect((log.detail as { reason: string }).reason).toBe('Badge reader down');
    await expect(
      hrCorrect(await asUser(c.M.id), {
        employeeId: c.B.id,
        date: past,
        inTime: '09:30',
        outTime: '18:30',
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('an approved correction changes the day from Absent to Present', async () => {
    await finaliseDay(past);
    const bharat = await asUser(c.B.id);
    const reg = await applyRegularisation(bharat, {
      date: past,
      inTime: '09:25',
      outTime: '18:40',
      reason: 'Client site',
    });
    const inboxM = await approvalsInbox(await asUser(c.M.id));
    expect(inboxM.regs.map((r) => r.id)).toContain(reg.id);
    const inboxF = await approvalsInbox(await asUser(c.F.id));
    expect(inboxF.regs).toHaveLength(0);
    await decideRegularisation(await asUser(c.M.id), reg.id, true, '');
    const days = await attendanceRange(c.B.id, past, past);
    expect(days[0]!.status).toBe('PRESENT');
    const punches = await db.punch.findMany({ where: { employeeId: c.B.id, businessDate: toDbDate(past) } });
    expect(punches.every((p) => p.method === 'REGULARISED')).toBe(true);
  });

  it('payslip LOP equals absent working days', async () => {
    const ym = past.slice(0, 7);
    await finaliseDay(past);
    const slip = await payslipFor(c.B.id, ym);
    expect(slip.absentDays).toBeGreaterThanOrEqual(1);
    expect(slip.lopDays).toBe(slip.absentDays + slip.beforeJoinDays);
    expect(slip.netPaise).toBe(slip.grossPaise - slip.lopPaise);
  });

  it('clears precise coordinates after the retention period but keeps distance and office', async () => {
    await db.punch.create({
      data: {
        employeeId: c.A.id,
        at: new Date(Date.now() - 200 * 86_400_000),
        businessDate: toDbDate('2026-01-05'),
        direction: 'IN',
        method: 'GEO',
        lat: 23,
        lng: 72,
        accuracyM: 10,
        distanceM: 40,
        officeId: c.office.id,
      },
    });
    const r = await purgeOldCoordinates();
    expect(r.cleared).toBe(1);
    const p = await db.punch.findFirstOrThrow({ where: { employeeId: c.A.id } });
    expect(p).toMatchObject({ lat: null, lng: null, accuracyM: null, distanceM: 40, officeId: c.office.id });
  });
});

describe('employee records', () => {
  it('prevents removing the last Super Admin and self-deactivation', async () => {
    const s = await asUser(c.S.id);
    await expect(setEmployeeStatus(s, c.S.id, false)).rejects.toThrow(/yourself/);
    await expect(setEmployeeStatus(await asUser(c.H.id), c.S.id, false)).rejects.toThrow(
      /last active Super Admin/,
    );
    await expect(setEmployeeRoles(s, c.S.id, [c.roles['Employee']!])).rejects.toThrow(/last Super Admin/);
  });
  it('lets HR edit records but only emp.roles change roles', async () => {
    const hrExec = await asUser(c.H.id, 'Employee');
    await expect(setEmployeeRoles(hrExec, c.A.id, [c.roles['Manager']!])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await db.employeeRole.create({ data: { employeeId: c.F.id, roleId: c.roles['HR Executive']! } });
    const pooja = await asUser(c.F.id, 'HR Executive');
    await updateEmployee(pooja, c.A.id, {
      name: 'Asha K',
      email: 'a01@test.example',
      phone: null,
      dept: 'Ops',
      title: 'Lead',
      managerId: c.M.id,
      joinedOn: '2024-01-01',
      workMode: 'OFFICE',
      officeId: c.office.id,
      ctcRupees: 1300000,
    });
    await expect(setEmployeeRoles(pooja, c.A.id, [c.roles['Manager']!])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'employee.update', entityId: c.A.id },
    });
    expect(
      (log.detail as { changes: Record<string, { before: unknown; after: unknown }> }).changes.title,
    ).toEqual({ before: 'Staff', after: 'Lead' });
  });
  it('deactivated employees disappear from approvals and cannot be decided for twice', async () => {
    await setEmployeeStatus(await asUser(c.H.id), c.A.id, false);
    const a = await db.employee.findUniqueOrThrow({ where: { id: c.A.id } });
    expect(a.status).toBe('INACTIVE');
  });
});

describe('expenses', () => {
  it('flows Pending → Approved by manager → Reimbursed by Finance', async () => {
    const claim = await submitExpense(await asUser(c.A.id), {
      date: businessDate(),
      category: 'Travel',
      amountPaise: 185050,
      note: 'Cab',
    });
    await expect(reimburseExpense(await asUser(c.F.id), claim.id)).rejects.toThrow(/Only approved/);
    await decideExpense(await asUser(c.M.id), claim.id, true, '');
    await expect(reimburseExpense(await asUser(c.M.id), claim.id)).rejects.toBeInstanceOf(ForbiddenError);
    const paid = await reimburseExpense(await asUser(c.F.id), claim.id);
    expect(paid.status).toBe('REIMBURSED');
  });
  it('rejects bad receipts', async () => {
    const fake = new File([Buffer.from('not an image')], 'x.jpg', { type: 'image/jpeg' });
    await expect(
      submitExpense(await asUser(c.A.id), {
        date: businessDate(),
        category: 'Food',
        amountPaise: 100,
        note: 'x',
        receipt: fake,
      }),
    ).rejects.toThrow(/image/);
  });
});

describe('face', () => {
  const vec = (v: number) => Array.from({ length: 128 }, () => v);
  it('enrols with consent, matches, rate-limits failures, and withdrawal deletes the template', async () => {
    const asha = await asUser(c.A.id);
    await expect(enrolFace(asha, [vec(0.1)], 'old')).rejects.toThrow(/consent/);
    await enrolFace(asha, [vec(0.1), vec(0.11)], FACE_CONSENT_VERSION);
    const stored = await db.faceTemplate.findUniqueOrThrow({ where: { employeeId: c.A.id } });
    expect(Buffer.from(stored.samples).toString('utf8')).not.toContain('0.1'); // encrypted at rest
    expect((await matchFace(asha, vec(0.105))).distance).toBeLessThan(0.5);
    for (let i = 0; i < 5; i++) await expect(matchFace(asha, vec(0.4))).rejects.toThrow(/did not match/);
    await expect(matchFace(asha, vec(0.1))).rejects.toThrow(/Too many failed/);
    await withdrawFace(asha);
    expect(await db.faceTemplate.count()).toBe(0);
    expect(await db.consentRecord.count({ where: { employeeId: c.A.id, withdrawnAt: null } })).toBe(0);
  });
});

describe('kiosk', () => {
  it('accepts the current code and stops at once when revoked', async () => {
    const s = await asUser(c.S.id);
    const { device, token } = await registerKiosk(s, c.office.id, 'Reception');
    const shown = await kioskDisplay(device.id, token);
    expect(shown?.code).toMatch(/^\d{6}$/);
    expect(await kioskDisplay(device.id, 'wrong-token')).toBeNull();
    expect((await resolveKioskCode(shown!.code))?.id).toBe(device.id);
    await revokeKiosk(s, device.id);
    expect(await resolveKioskCode(shown!.code)).toBeNull();
    expect(await kioskDisplay(device.id, token)).toBeNull();
  });
});

describe('dates sanity for fixtures', () => {
  it('uses IST dates', () => {
    expect(fromDbDate(toDbDate(businessDate()))).toBe(businessDate());
  });
});

describe('encryption keys', () => {
  it('accepts a long passphrase as well as a base64 key', async () => {
    const { encryptString, decryptString } = await import('@/server/crypto');
    const prev = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = 'a long passphrase that is not base64 at all!!';
    expect(decryptString(encryptString('hello'))).toBe('hello');
    process.env.APP_ENCRYPTION_KEY = 'too short';
    expect(() => encryptString('x')).toThrow(/at least 32/);
    process.env.APP_ENCRYPTION_KEY = prev;
    expect(decryptString(encryptString('hello'))).toBe('hello');
  });
});
