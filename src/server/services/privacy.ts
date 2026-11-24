import 'server-only';
import { db } from '../db';
import { getSetting } from '../settings';
import { writeAudit } from './audit';
import type { CurrentUser } from '../rbac';
import { fromDbDate, istTime } from '@/lib/dates';

/** Delete precise coordinates from punches older than the retention period (keep distance and office). */
export async function purgeOldCoordinates(now = new Date()) {
  const { coordsDays } = await getSetting('retention');
  const cutoff = new Date(now.getTime() - coordsDays * 86_400_000);
  const r = await db.punch.updateMany({
    where: { at: { lt: cutoff }, OR: [{ lat: { not: null } }, { lng: { not: null } }] },
    data: { lat: null, lng: null, accuracyM: null },
  });
  await db.$transaction((tx) =>
    writeAudit(tx, null, 'retention.coords', 'Punch', null, { cleared: r.count, coordsDays }),
  );
  return { cleared: r.count, cutoff: cutoff.toISOString() };
}

/** Everything held about the signed-in person (no face template bytes). */
export async function exportOwnData(user: CurrentUser) {
  const e = await db.employee.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      office: true,
      manager: { select: { code: true, name: true } },
      roles: { include: { role: true } },
    },
  });
  const [punches, days, leave, balances, regs, expenses, consents, face] = await Promise.all([
    db.punch.findMany({ where: { employeeId: user.id }, orderBy: { at: 'asc' } }),
    db.attendanceDay.findMany({ where: { employeeId: user.id }, orderBy: { businessDate: 'asc' } }),
    db.leaveRequest.findMany({ where: { employeeId: user.id }, orderBy: { from: 'asc' } }),
    db.leaveBalance.findMany({ where: { employeeId: user.id } }),
    db.regularisation.findMany({ where: { employeeId: user.id } }),
    db.expenseClaim.findMany({ where: { employeeId: user.id } }),
    db.consentRecord.findMany({ where: { employeeId: user.id } }),
    db.faceTemplate.findUnique({
      where: { employeeId: user.id },
      select: { sampleCount: true, consentAt: true, consentVersion: true },
    }),
  ]);
  await db.$transaction((tx) => writeAudit(tx, user, 'privacy.export', 'Employee', user.id, {}));
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      code: e.code,
      name: e.name,
      email: e.email,
      phone: e.phone,
      dept: e.dept,
      title: e.title,
      manager: e.manager,
      joinedOn: fromDbDate(e.joinedOn),
      workMode: e.workMode,
      office: e.office?.name ?? null,
      roles: e.roles.map((r) => r.role.name),
      annualCtcInr: Number(e.ctcPaise) / 100,
      status: e.status,
    },
    faceTemplate: face
      ? { ...face, note: 'Only a 128-number template is stored, encrypted. No photo is kept.' }
      : null,
    consents,
    punches: punches.map((p) => ({ ...p, time: istTime(p.at), businessDate: fromDbDate(p.businessDate) })),
    attendanceDays: days.map((d) => ({ ...d, businessDate: fromDbDate(d.businessDate) })),
    leaveRequests: leave.map((l) => ({ ...l, from: fromDbDate(l.from), to: fromDbDate(l.to) })),
    leaveBalances: balances,
    regularisations: regs.map((r) => ({ ...r, date: fromDbDate(r.date) })),
    expenseClaims: expenses.map((x) => ({
      ...x,
      date: fromDbDate(x.date),
      amountInr: Number(x.amountPaise) / 100,
      amountPaise: undefined,
    })),
  };
}
