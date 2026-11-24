import 'server-only';
import { db } from '../db';
import { writeAudit } from './audit';
import { rebuildAttendanceDay } from './attendance';
import { getSetting, setSetting, type PunchSettings } from '../settings';
import { requirePermission, type CurrentUser } from '../rbac';
import { NotFoundError, UserError } from '../errors';
import { businessDate, fromDbDate, isHHMM, minutesOf, toDbDate, type ISODate } from '@/lib/dates';

async function rebuildEveryoneOn(date: ISODate) {
  if (date > businessDate()) return;
  const emps = await db.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  for (const e of emps)
    await db.$transaction((tx) => rebuildAttendanceDay(tx, e.id, date, { finalise: date < businessDate() }));
}

export async function addHoliday(
  user: CurrentUser,
  input: { date: ISODate; name: string; officeId: string | null },
) {
  requirePermission(user, 'holidays.manage');
  const h = await db.$transaction(async (tx) => {
    const dup = await tx.holiday.findFirst({
      where: { date: toDbDate(input.date), officeId: input.officeId },
    });
    if (dup) throw new UserError('There is already a holiday on that date.');
    const h = await tx.holiday.create({
      data: { date: toDbDate(input.date), name: input.name.trim(), officeId: input.officeId },
    });
    await writeAudit(tx, user, 'holiday.add', 'Holiday', h.id, input);
    return h;
  });
  await rebuildEveryoneOn(input.date);
  return h;
}

export async function removeHoliday(user: CurrentUser, id: string) {
  requirePermission(user, 'holidays.manage');
  const h = await db.$transaction(async (tx) => {
    const h = await tx.holiday.findUnique({ where: { id } });
    if (!h) throw new NotFoundError('Holiday');
    await tx.holiday.delete({ where: { id } });
    await writeAudit(tx, user, 'holiday.remove', 'Holiday', id, { date: fromDbDate(h.date), name: h.name });
    return h;
  });
  await rebuildEveryoneOn(fromDbDate(h.date));
}

export async function postAnnouncement(
  user: CurrentUser,
  input: { title: string; body: string; pinned: boolean },
) {
  requirePermission(user, 'announce.post');
  return db.$transaction(async (tx) => {
    const a = await tx.announcement.create({ data: { ...input, authorId: user.id } });
    await writeAudit(tx, user, 'announcement.post', 'Announcement', a.id, { title: input.title });
    return a;
  });
}

export async function updateAnnouncement(
  user: CurrentUser,
  id: string,
  patch: { pinned?: boolean; remove?: boolean },
) {
  requirePermission(user, 'announce.post');
  return db.$transaction(async (tx) => {
    const a = await tx.announcement.findUnique({ where: { id } });
    if (!a) throw new NotFoundError('Announcement');
    if (patch.remove) {
      await tx.announcement.delete({ where: { id } });
      await writeAudit(tx, user, 'announcement.remove', 'Announcement', id, { title: a.title });
      return;
    }
    await tx.announcement.update({ where: { id }, data: { pinned: !!patch.pinned } });
    await writeAudit(tx, user, 'announcement.pin', 'Announcement', id, { pinned: !!patch.pinned });
  });
}

export async function upsertOffice(
  user: CurrentUser,
  input: {
    id?: string;
    code: string;
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
    faceEnabled: boolean;
    geoEnabled: boolean;
  },
) {
  requirePermission(user, 'settings.manage');
  return db.$transaction(async (tx) => {
    const { id, ...data } = input;
    const clash = await tx.office.findUnique({ where: { code: data.code } });
    if (clash && clash.id !== id) throw new UserError('Another office uses that code.');
    const before = id ? await tx.office.findUnique({ where: { id } }) : null;
    const o = id ? await tx.office.update({ where: { id }, data }) : await tx.office.create({ data });
    await writeAudit(tx, user, id ? 'office.update' : 'office.create', 'Office', o.id, { before, after: o });
    return o;
  });
}

export async function updateShift(
  user: CurrentUser,
  input: { start: string; end: string; lateAfter: string; shortDayHours: number },
) {
  requirePermission(user, 'settings.manage');
  if (![input.start, input.end, input.lateAfter].every(isHHMM)) throw new UserError('Times must be HH:mm.');
  if (minutesOf(input.end) <= minutesOf(input.start))
    throw new UserError('Shift end must be after its start.');
  return db.$transaction(async (tx) => {
    const before = await tx.shift.findFirst({ where: { isDefault: true } });
    const s = before
      ? await tx.shift.update({ where: { id: before.id }, data: input })
      : await tx.shift.create({ data: { ...input, isDefault: true } });
    await writeAudit(tx, user, 'shift.update', 'Shift', s.id, { before, after: s });
    return s;
  });
}

export async function updatePunchSettings(user: CurrentUser, value: PunchSettings, coordsDays: number) {
  requirePermission(user, 'settings.manage');
  const before = { punch: await getSetting('punch'), retention: await getSetting('retention') };
  await db.$transaction(async (tx) => {
    await setSetting('punch', value, tx);
    await setSetting('retention', { coordsDays }, tx);
    await writeAudit(tx, user, 'settings.punch', 'Setting', 'punch', {
      before,
      after: { punch: value, retention: { coordsDays } },
    });
  });
}

export async function setSheetId(user: CurrentUser, sheetId: string) {
  requirePermission(user, 'sheets.sync');
  const cur = await getSetting('sheets');
  await db.$transaction(async (tx) => {
    await setSetting('sheets', { ...cur, sheetId }, tx);
    await writeAudit(tx, user, 'sheets.link', 'Setting', 'sheets', { before: cur.sheetId, after: sheetId });
  });
}
