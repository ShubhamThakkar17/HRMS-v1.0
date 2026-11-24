import 'server-only';
import { db } from '../db';
import { writeAudit } from './audit';
import { nextCode } from './codes';
import { notifyLater } from './notify';
import { replaceDayPunches } from './attendance';
import { canDecide, type CurrentUser } from '../rbac';
import { ForbiddenError, NotFoundError, UserError } from '../errors';
import {
  businessDate,
  fmtDate,
  fromDbDate,
  isHHMM,
  isWeekend,
  minutesOf,
  toDbDate,
  type ISODate,
} from '@/lib/dates';

export async function applyRegularisation(
  user: CurrentUser,
  input: { date: ISODate; inTime: string; outTime: string; reason: string },
) {
  if (input.date > businessDate()) throw new UserError('You cannot correct a future date.');
  if (isWeekend(input.date)) throw new UserError('That date is a weekend.');
  if (!isHHMM(input.inTime) || !isHHMM(input.outTime)) throw new UserError('Times must be HH:mm.');
  if (minutesOf(input.outTime) <= minutesOf(input.inTime))
    throw new UserError('Check-out must be after check-in.');
  if (input.reason.trim().length < 3) throw new UserError('Please give a reason.');
  const reg = await db.$transaction(async (tx) => {
    const dup = await tx.regularisation.findFirst({
      where: { employeeId: user.id, date: toDbDate(input.date), status: 'PENDING' },
    });
    if (dup) throw new UserError('You already have a pending correction for that date.');
    const code = await nextCode(tx, 'reg');
    const r = await tx.regularisation.create({
      data: {
        code,
        employeeId: user.id,
        date: toDbDate(input.date),
        inTime: input.inTime,
        outTime: input.outTime,
        reason: input.reason.trim(),
      },
    });
    await writeAudit(tx, user, 'regularisation.apply', 'Regularisation', r.id, { code, ...input });
    return r;
  });
  const manager = user.managerId ? await db.employee.findUnique({ where: { id: user.managerId } }) : null;
  if (manager) {
    notifyLater([
      {
        to: manager.email,
        subject: `Attendance correction from ${user.name}`,
        text: `${user.name} asked to correct ${fmtDate(input.date)} to ${input.inTime}–${input.outTime}.\nReason: ${input.reason}`,
        link: '/approvals',
      },
    ]);
  }
  return reg;
}

export async function cancelRegularisation(user: CurrentUser, id: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.regularisation.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Correction');
    if (r.employeeId !== user.id) throw new ForbiddenError();
    if (r.status !== 'PENDING') throw new UserError('Only pending corrections can be cancelled.');
    await tx.regularisation.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    await writeAudit(tx, user, 'regularisation.cancel', 'Regularisation', id, { code: r.code });
  });
}

/** Approved corrections write punches with method REGULARISED and rebuild the AttendanceDay. */
export async function decideRegularisation(user: CurrentUser, id: string, approve: boolean, comment: string) {
  const out = await db.$transaction(async (tx) => {
    const r = await tx.regularisation.findUnique({ where: { id }, include: { employee: true } });
    if (!r) throw new NotFoundError('Correction');
    if (!canDecide(user, r.employee)) throw new ForbiddenError('approve.team');
    if (r.status !== 'PENDING') throw new UserError('This correction has already been decided.');
    if (!approve && comment.trim().length < 3) throw new UserError('Please give a reason for rejecting.');
    const date = fromDbDate(r.date);
    let dayStatus: string | null = null;
    let before: unknown = null;
    if (approve) {
      const res = await replaceDayPunches(tx, r.employeeId, date, r.inTime, r.outTime, 'REGULARISED');
      dayStatus = res.day?.status ?? null;
      before = res.before;
    }
    const updated = await tx.regularisation.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approverId: user.id,
        comment: comment.trim() || null,
        decidedAt: new Date(),
      },
    });
    await writeAudit(
      tx,
      user,
      approve ? 'regularisation.approve' : 'regularisation.reject',
      'Regularisation',
      id,
      {
        code: r.code,
        employeeId: r.employeeId,
        date,
        comment,
        before,
        after: { status: updated.status, dayStatus },
      },
    );
    return { r, updated };
  });
  notifyLater([
    {
      to: out.r.employee.email,
      subject: `Your attendance correction ${out.r.code} was ${approve ? 'approved' : 'rejected'}`,
      text: `${user.name} ${approve ? 'approved' : 'rejected'} your correction for ${fmtDate(fromDbDate(out.r.date))}.${comment ? `\nComment: ${comment}` : ''}`,
      link: '/my/attendance',
    },
  ]);
  return out.updated;
}
