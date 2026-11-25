import 'server-only';
import type { PunchMethod } from '@prisma/client';
import { db, type Tx } from '../db';
import { getShift } from '../settings';
import { writeAudit } from './audit';
import { approvedLeaveDates, holidaysFor } from './calendar';
import { requirePermission, type CurrentUser } from '../rbac';
import { UserError, NotFoundError, ForbiddenError } from '../errors';
import { rebuildDay, displayStatus, type DayStatusCode, type DisplayCode } from '@/lib/attendance-rules';
import {
  addDays,
  businessDate,
  eachDay,
  fromDbDate,
  isHHMM,
  istInstant,
  minutesOf,
  monthRange,
  toDbDate,
  type ISODate,
} from '@/lib/dates';

/** Rebuild one AttendanceDay from that day's punches, applying the shift, holidays, weekends and approved leave. */
export async function rebuildAttendanceDay(
  tx: Tx,
  employeeId: string,
  date: ISODate,
  opts: { finalise?: boolean } = {},
) {
  const emp = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new NotFoundError('Employee');
  if (fromDbDate(emp.joinedOn) > date) return null;
  const [shift, holidays, leave, punches] = await Promise.all([
    getShift(tx),
    holidaysFor(tx, emp.officeId, date, date),
    approvedLeaveDates(tx, employeeId, date, date),
    tx.punch.findMany({ where: { employeeId, businessDate: toDbDate(date) }, orderBy: { at: 'asc' } }),
  ]);
  const r = rebuildDay(punches, { date, shift, isHoliday: holidays.has(date), onLeave: leave.has(date) });
  const key = { employeeId_businessDate: { employeeId, businessDate: toDbDate(date) } };
  // Without punches, an unfinalised working day is left blank (shown as "not checked in" or "absent").
  if (!punches.length && r.status === 'ABSENT' && !opts.finalise) {
    await tx.attendanceDay.deleteMany({ where: { employeeId, businessDate: toDbDate(date) } });
    return null;
  }
  const data = {
    firstIn: r.firstIn,
    lastOut: r.lastOut,
    hours: r.hours,
    status: r.status,
    inMethod: (r.inMethod as PunchMethod | null) ?? null,
    outMethod: (r.outMethod as PunchMethod | null) ?? null,
    officeId: r.officeId,
    remote: r.remote,
    flagged: r.flagged,
  };
  return tx.attendanceDay.upsert({
    where: key,
    create: { employeeId, businessDate: toDbDate(date), ...data, finalised: !!opts.finalise },
    update: { ...data, ...(opts.finalise ? { finalised: true } : {}) },
  });
}

export interface PunchInput {
  method: 'WEB' | 'GEO' | 'FACE' | 'KIOSK';
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  distanceM?: number | null;
  officeId?: string | null;
  zoneName?: string | null;
  flag?: 'OUTSIDE_GEOFENCE' | null;
  faceScore?: number | null;
  deviceInfo?: string | null;
}

/** Record a self-service punch. The first punch of the day is IN, the next is OUT. */
export async function recordPunch(user: CurrentUser, input: PunchInput, at: Date = new Date()) {
  const date = businessDate(at);
  return db.$transaction(async (tx) => {
    const existing = await tx.punch.findMany({
      where: { employeeId: user.id, businessDate: toDbDate(date) },
      orderBy: { at: 'asc' },
    });
    const hasIn = existing.some((p) => p.direction === 'IN');
    const hasOut = existing.some((p) => p.direction === 'OUT');
    if (hasIn && hasOut) throw new UserError('You have already checked in and out today.');
    const direction = hasIn ? 'OUT' : 'IN';
    const last = existing[existing.length - 1];
    if (last && at.getTime() - last.at.getTime() < 60_000) {
      throw new UserError('You punched less than a minute ago. Please wait a moment.');
    }
    const punch = await tx.punch.create({
      data: {
        employeeId: user.id,
        at,
        businessDate: toDbDate(date),
        direction,
        method: input.method,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        accuracyM: input.accuracyM ?? null,
        distanceM: input.distanceM ?? null,
        officeId: input.officeId ?? null,
        zoneName: input.zoneName ?? null,
        flag: input.flag ?? null,
        faceScore: input.faceScore ?? null,
        deviceInfo: input.deviceInfo?.slice(0, 300) ?? null,
      },
    });
    const day = await rebuildAttendanceDay(tx, user.id, date);
    await writeAudit(tx, user, direction === 'IN' ? 'punch.in' : 'punch.out', 'Punch', punch.id, {
      method: input.method,
      officeId: input.officeId ?? null,
      zoneName: input.zoneName ?? null,
      distanceM: input.distanceM ?? null,
      flag: input.flag ?? null,
    });
    return { punch, day, direction };
  });
}

/** Replace a day's punches with an IN/OUT pair (HR correction or approved regularisation) and rebuild it. */
export async function replaceDayPunches(
  tx: Tx,
  employeeId: string,
  date: ISODate,
  inTime: string,
  outTime: string | null,
  method: 'HR' | 'REGULARISED',
) {
  if (!isHHMM(inTime) || (outTime && !isHHMM(outTime))) throw new UserError('Times must be HH:mm.');
  if (outTime && minutesOf(outTime) <= minutesOf(inTime))
    throw new UserError('Check-out must be after check-in.');
  const before = await tx.punch.findMany({
    where: { employeeId, businessDate: toDbDate(date) },
    orderBy: { at: 'asc' },
  });
  await tx.punch.deleteMany({ where: { employeeId, businessDate: toDbDate(date) } });
  const keepOffice = before.find((p) => p.direction === 'IN')?.officeId ?? null;
  await tx.punch.create({
    data: {
      employeeId,
      at: istInstant(date, inTime),
      businessDate: toDbDate(date),
      direction: 'IN',
      method,
      officeId: keepOffice,
    },
  });
  if (outTime) {
    await tx.punch.create({
      data: {
        employeeId,
        at: istInstant(date, outTime),
        businessDate: toDbDate(date),
        direction: 'OUT',
        method,
        officeId: keepOffice,
      },
    });
  }
  const day = await rebuildAttendanceDay(tx, employeeId, date, { finalise: date < businessDate() });
  return {
    before: before.map((p) => ({ direction: p.direction, at: p.at.toISOString(), method: p.method })),
    day,
  };
}

/** HR correction with a required reason (att.correct). */
export async function hrCorrect(
  user: CurrentUser,
  input: { employeeId: string; date: ISODate; inTime: string; outTime: string | null; reason: string },
) {
  requirePermission(user, 'att.correct');
  if (input.date > businessDate()) throw new UserError('You cannot correct a future date.');
  if (input.reason.trim().length < 3) throw new UserError('A reason is required.');
  return db.$transaction(async (tx) => {
    const r = await replaceDayPunches(tx, input.employeeId, input.date, input.inTime, input.outTime, 'HR');
    await writeAudit(tx, user, 'attendance.correct', 'AttendanceDay', `${input.employeeId}:${input.date}`, {
      employeeId: input.employeeId,
      date: input.date,
      reason: input.reason,
      before: r.before,
      after: { in: input.inTime, out: input.outTime, status: r.day?.status ?? null },
    });
    return r.day;
  });
}

/** Nightly job: finalise a day for every active employee and mark absent anyone with no punch and no leave. */
export async function finaliseDay(date: ISODate) {
  const emps = await db.employee.findMany({ where: { status: 'ACTIVE', joinedOn: { lte: toDbDate(date) } } });
  const counts: Record<string, number> = {};
  for (const e of emps) {
    const day = await db.$transaction((tx) => rebuildAttendanceDay(tx, e.id, date, { finalise: true }));
    if (day) counts[day.status] = (counts[day.status] ?? 0) + 1;
  }
  await db.auditLog.create({
    data: {
      role: 'system',
      action: 'attendance.finalise',
      entity: 'AttendanceDay',
      entityId: date,
      detail: counts,
    },
  });
  return counts;
}

export interface CalendarDay {
  date: ISODate;
  status: DisplayCode;
  firstIn: Date | null;
  lastOut: Date | null;
  hours: number | null;
  inMethod: string | null;
  outMethod: string | null;
  officeId: string | null;
  remote: boolean;
  flagged: boolean;
  holidayName?: string;
  distanceM?: number | null;
  accuracyM?: number | null;
  faceScore?: number | null;
  zoneName?: string | null;
}

type EmpLite = { id: string; joinedOn: Date; officeId: string | null };

/** Day-by-day attendance for many employees over a range, in four queries whatever the headcount. */
export async function attendanceForMany(
  emps: EmpLite[],
  from: ISODate,
  to: ISODate,
  today = businessDate(),
): Promise<Map<string, CalendarDay[]>> {
  const ids = emps.map((e) => e.id);
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [rows, holidayRows, leaves, inPunches] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: { in: ids }, businessDate: range } }),
    db.holiday.findMany({ where: { date: range } }),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: 'APPROVED',
        from: { lte: toDbDate(to) },
        to: { gte: toDbDate(from) },
      },
      select: { employeeId: true, from: true, to: true },
    }),
    db.punch.findMany({
      where: { employeeId: { in: ids }, direction: 'IN', businessDate: range },
      select: {
        employeeId: true,
        businessDate: true,
        distanceM: true,
        accuracyM: true,
        faceScore: true,
        zoneName: true,
      },
    }),
  ]);
  const key = (id: string, d: ISODate) => `${id}|${d}`;
  const rowBy = new Map(rows.map((r) => [key(r.employeeId, fromDbDate(r.businessDate)), r]));
  const punchBy = new Map(inPunches.map((p) => [key(p.employeeId, fromDbDate(p.businessDate)), p]));
  const leaveSet = new Set<string>();
  for (const l of leaves) {
    for (const d of eachDay(fromDbDate(l.from), fromDbDate(l.to)))
      if (d >= from && d <= to) leaveSet.add(key(l.employeeId, d));
  }
  const days = eachDay(from, to);
  const out = new Map<string, CalendarDay[]>();
  for (const e of emps) {
    const holidayName = new Map(
      holidayRows
        .filter((h) => h.officeId === null || h.officeId === e.officeId)
        .map((h) => [fromDbDate(h.date), h.name]),
    );
    const joined = fromDbDate(e.joinedOn);
    out.set(
      e.id,
      days.map((date): CalendarDay => {
        const r = rowBy.get(key(e.id, date));
        const p = punchBy.get(key(e.id, date));
        return {
          date,
          status: displayStatus({
            date,
            today,
            joinedOn: joined,
            stored: (r?.status as DayStatusCode | undefined) ?? null,
            isHoliday: holidayName.has(date),
            onLeave: leaveSet.has(key(e.id, date)),
          }),
          firstIn: r?.firstIn ?? null,
          lastOut: r?.lastOut ?? null,
          hours: r?.hours ?? null,
          inMethod: r?.inMethod ?? null,
          outMethod: r?.outMethod ?? null,
          officeId: r?.officeId ?? null,
          remote: r?.remote ?? false,
          flagged: r?.flagged ?? false,
          holidayName: holidayName.get(date),
          distanceM: p?.distanceM ?? null,
          accuracyM: p?.accuracyM ?? null,
          faceScore: p?.faceScore ?? null,
          zoneName: p?.zoneName ?? null,
        };
      }),
    );
  }
  return out;
}

/** Day-by-day attendance for one employee over a range. */
export async function attendanceRange(
  employeeId: string,
  from: ISODate,
  to: ISODate,
  today = businessDate(),
) {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, joinedOn: true, officeId: true },
  });
  if (!emp) throw new NotFoundError('Employee');
  return (await attendanceForMany([emp], from, to, today)).get(emp.id)!;
}

export async function attendanceMonth(employeeId: string, ym: string) {
  const { from, to } = monthRange(ym);
  return attendanceRange(employeeId, from, to);
}

/** Today's status for a list of employees (directory, team overview, HR attendance). */
export async function statusOn(employeeIds: string[], date: ISODate) {
  const [rows, leaves, holidays, emps] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: { in: employeeIds }, businessDate: toDbDate(date) } }),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        from: { lte: toDbDate(date) },
        to: { gte: toDbDate(date) },
      },
    }),
    db.holiday.findMany({ where: { date: toDbDate(date) } }),
    db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, joinedOn: true, officeId: true },
    }),
  ]);
  const today = businessDate();
  const rowBy = new Map(rows.map((r) => [r.employeeId, r]));
  const onLeave = new Set(leaves.map((l) => l.employeeId));
  const out = new Map<string, { status: DisplayCode; row: (typeof rows)[number] | null }>();
  for (const e of emps) {
    const isHoliday = holidays.some((h) => h.officeId === null || h.officeId === e.officeId);
    const row = rowBy.get(e.id) ?? null;
    out.set(e.id, {
      status: displayStatus({
        date,
        today,
        joinedOn: fromDbDate(e.joinedOn),
        stored: (row?.status as DayStatusCode | undefined) ?? null,
        isHoliday,
        onLeave: onLeave.has(e.id),
      }),
      row,
    });
  }
  return out;
}

/** Who may view an employee's attendance: self, their manager (team.view), or att.all. */
export async function assertCanViewAttendance(user: CurrentUser, employeeId: string) {
  if (employeeId === user.id || user.permissions.has('att.all')) return;
  if (user.permissions.has('team.view')) {
    const e = await db.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
    if (e?.managerId === user.id) return;
  }
  throw new ForbiddenError('att.all');
}

export function previousDay(date: ISODate) {
  return addDays(date, -1);
}
