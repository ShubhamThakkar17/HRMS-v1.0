import 'server-only';
import { db, type Tx } from '../db';
import { writeAudit } from './audit';
import { holidaysFor } from './calendar';
import { nextCode } from './codes';
import { notifyLater } from './notify';
import { rebuildAttendanceDay } from './attendance';
import { canDecide, requirePermission, type CurrentUser } from '../rbac';
import { ForbiddenError, NotFoundError, UserError } from '../errors';
import { businessDate, eachDay, fmtDate, fromDbDate, toDbDate, type ISODate } from '@/lib/dates';
import {
  APPLY_ERROR_TEXT,
  available,
  carryForwardDays,
  remaining,
  validateLeaveApplication,
} from '@/lib/leave-rules';

export async function ensureBalances(tx: Tx, employeeId: string, year: number) {
  const types = await tx.leaveType.findMany({ where: { active: true } });
  for (const t of types) {
    await tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeCode_year: { employeeId, leaveTypeCode: t.code, year } },
      create: { employeeId, leaveTypeCode: t.code, year, opening: 0, accrued: t.annualDays, used: 0 },
      update: {},
    });
  }
}

export async function pendingDays(
  tx: Tx,
  employeeId: string,
  type: string,
  year: number,
  excludeId?: string,
) {
  const rows = await tx.leaveRequest.findMany({
    where: {
      employeeId,
      type,
      status: 'PENDING',
      from: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return rows.reduce((s, r) => s + r.days, 0);
}

export async function balancesFor(employeeId: string, year = Number(businessDate().slice(0, 4))) {
  await db.$transaction((tx) => ensureBalances(tx, employeeId, year));
  const [types, rows] = await Promise.all([
    db.leaveType.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
    db.leaveBalance.findMany({ where: { employeeId, year } }),
  ]);
  const out = [];
  for (const t of types) {
    const b = rows.find((r) => r.leaveTypeCode === t.code) ?? { opening: 0, accrued: t.annualDays, used: 0 };
    const pending = await pendingDays(db, employeeId, t.code, year);
    out.push({
      code: t.code,
      name: t.name,
      annual: t.annualDays,
      opening: b.opening,
      accrued: b.accrued,
      used: b.used,
      pending,
      remaining: remaining(b),
      available: available(b, pending),
    });
  }
  return out;
}

export async function applyLeave(
  user: CurrentUser,
  input: { type: string; from: ISODate; to: ISODate; reason: string },
) {
  const year = Number(input.from.slice(0, 4));
  if (input.to.slice(0, 4) !== input.from.slice(0, 4)) {
    throw new UserError('Leave cannot span two calendar years. Please split it into two requests.');
  }
  const result = await db.$transaction(async (tx) => {
    const type = await tx.leaveType.findUnique({ where: { code: input.type } });
    if (!type || !type.active) throw new UserError('Choose a valid leave type.');
    await ensureBalances(tx, user.id, year);
    const [holidays, existing, balance, pending] = await Promise.all([
      holidaysFor(tx, user.officeId, input.from, input.to),
      tx.leaveRequest.findMany({ where: { employeeId: user.id, status: { in: ['PENDING', 'APPROVED'] } } }),
      tx.leaveBalance.findUniqueOrThrow({
        where: { employeeId_leaveTypeCode_year: { employeeId: user.id, leaveTypeCode: input.type, year } },
      }),
      pendingDays(tx, user.id, input.type, year),
    ]);
    const v = validateLeaveApplication({
      from: input.from,
      to: input.to,
      holidays,
      existing: existing.map((r) => ({ from: fromDbDate(r.from), to: fromDbDate(r.to), status: r.status })),
      balance,
      pendingDays: pending,
    });
    if (!v.ok) throw new UserError(APPLY_ERROR_TEXT[v.error]);
    const code = await nextCode(tx, 'leave');
    const req = await tx.leaveRequest.create({
      data: {
        code,
        employeeId: user.id,
        type: input.type,
        from: toDbDate(input.from),
        to: toDbDate(input.to),
        days: v.days,
        reason: input.reason.trim(),
      },
    });
    await writeAudit(tx, user, 'leave.apply', 'LeaveRequest', req.id, {
      code,
      type: input.type,
      from: input.from,
      to: input.to,
      days: v.days,
    });
    return req;
  });
  const manager = user.managerId ? await db.employee.findUnique({ where: { id: user.managerId } }) : null;
  if (manager) {
    notifyLater([
      {
        to: manager.email,
        subject: `Leave request from ${user.name}`,
        text: `${user.name} asked for ${result.days} day(s) of ${input.type} from ${fmtDate(input.from)} to ${fmtDate(input.to)}.\nReason: ${input.reason}`,
        link: '/approvals',
      },
    ]);
  }
  return result;
}

export async function cancelLeave(user: CurrentUser, id: string) {
  return db.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Leave request');
    if (req.employeeId !== user.id) throw new ForbiddenError();
    if (req.status !== 'PENDING') throw new UserError('Only pending requests can be cancelled.');
    await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    await writeAudit(tx, user, 'leave.cancel', 'LeaveRequest', id, { code: req.code });
  });
}

/** Approve or reject. Approval deducts the balance in the same transaction and never by the requester. */
export async function decideLeave(user: CurrentUser, id: string, approve: boolean, comment: string) {
  const out = await db.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!req) throw new NotFoundError('Leave request');
    if (!canDecide(user, req.employee)) throw new ForbiddenError('approve.team');
    if (req.status !== 'PENDING') throw new UserError('This request has already been decided.');
    if (!approve && comment.trim().length < 3) throw new UserError('Please give a reason for rejecting.');
    const from = fromDbDate(req.from);
    const year = Number(from.slice(0, 4));
    if (approve) {
      await ensureBalances(tx, req.employeeId, year);
      const bal = await tx.leaveBalance.findUniqueOrThrow({
        where: {
          employeeId_leaveTypeCode_year: { employeeId: req.employeeId, leaveTypeCode: req.type, year },
        },
      });
      if (remaining(bal) < req.days) {
        throw new UserError(
          `Not enough ${req.type} balance: ${remaining(bal)} day(s) left, ${req.days} requested.`,
        );
      }
      await tx.leaveBalance.update({
        where: {
          employeeId_leaveTypeCode_year: { employeeId: req.employeeId, leaveTypeCode: req.type, year },
        },
        data: { used: { increment: req.days } },
      });
    }
    const updated = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approverId: user.id,
        comment: comment.trim() || null,
        decidedAt: new Date(),
      },
    });
    if (approve) {
      const today = businessDate();
      for (const d of eachDay(from, fromDbDate(req.to))) {
        if (d <= today) await rebuildAttendanceDay(tx, req.employeeId, d, { finalise: d < today });
      }
    }
    await writeAudit(tx, user, approve ? 'leave.approve' : 'leave.reject', 'LeaveRequest', id, {
      code: req.code,
      employeeId: req.employeeId,
      days: req.days,
      comment,
      before: { status: 'PENDING' },
      after: { status: updated.status },
    });
    return { req, updated };
  });
  notifyLater([
    {
      to: out.req.employee.email,
      subject: `Your leave ${out.req.code} was ${approve ? 'approved' : 'rejected'}`,
      text: `${user.name} ${approve ? 'approved' : 'rejected'} your ${out.req.type} request for ${fmtDate(fromDbDate(out.req.from))} to ${fmtDate(fromDbDate(out.req.to))}.${comment ? `\nComment: ${comment}` : ''}`,
      link: '/my/leave',
    },
  ]);
  return out.updated;
}

/** 1 January job: open the new year's balances with carry forward capped at each type's limit. */
export async function yearlyRollover(newYear: number) {
  const [emps, types] = await Promise.all([
    db.employee.findMany({ where: { status: 'ACTIVE' } }),
    db.leaveType.findMany({ where: { active: true } }),
  ]);
  let rows = 0;
  await db.$transaction(async (tx) => {
    for (const e of emps) {
      for (const t of types) {
        const prev = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeCode_year: { employeeId: e.id, leaveTypeCode: t.code, year: newYear - 1 },
          },
        });
        const opening = prev ? carryForwardDays(prev, t.carryForward) : 0;
        await tx.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeCode_year: { employeeId: e.id, leaveTypeCode: t.code, year: newYear },
          },
          create: {
            employeeId: e.id,
            leaveTypeCode: t.code,
            year: newYear,
            opening,
            accrued: t.annualDays,
            used: 0,
          },
          update: { opening, accrued: t.annualDays },
        });
        rows++;
      }
    }
    await writeAudit(tx, null, 'leave.rollover', 'LeaveBalance', String(newYear), { rows });
  });
  return { rows };
}

export async function upsertLeaveType(
  user: CurrentUser,
  input: { code: string; name: string; annualDays: number; carryForward: number; active: boolean },
) {
  requirePermission(user, 'leave.policy');
  return db.$transaction(async (tx) => {
    const before = await tx.leaveType.findUnique({ where: { code: input.code } });
    const t = await tx.leaveType.upsert({ where: { code: input.code }, create: input, update: input });
    await writeAudit(tx, user, before ? 'leaveType.update' : 'leaveType.create', 'LeaveType', input.code, {
      before,
      after: t,
    });
    return t;
  });
}
