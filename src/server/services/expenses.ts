import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { writeAudit } from './audit';
import { nextCode } from './codes';
import { notifyLater } from './notify';
import { MAX_RECEIPT_BYTES, RECEIPT_TYPES, putObject, sniffType } from './storage';
import { canDecide, requirePermission, type CurrentUser } from '../rbac';
import { ForbiddenError, NotFoundError, UserError } from '../errors';
import { businessDate, toDbDate, type ISODate } from '@/lib/dates';
import { formatINR } from '@/lib/money';

export const EXPENSE_CATEGORIES = [
  'Travel',
  'Food',
  'Client meeting',
  'Internet',
  'Phone',
  'Supplies',
  'Training',
  'Other',
];

export async function submitExpense(
  user: CurrentUser,
  input: { date: ISODate; category: string; amountPaise: number; note: string; receipt?: File | null },
) {
  if (input.date > businessDate()) throw new UserError('The expense date cannot be in the future.');
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new UserError('Choose a category.');
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new UserError('Enter an amount above zero.');
  if (input.amountPaise > 100_000_000) throw new UserError('That amount is too large for a claim.');
  let receipt: { key: string; name: string; type: string } | null = null;
  if (input.receipt && input.receipt.size > 0) {
    if (input.receipt.size > MAX_RECEIPT_BYTES) throw new UserError('Receipts must be 10 MB or smaller.');
    const buf = Buffer.from(await input.receipt.arrayBuffer());
    const type = sniffType(buf);
    if (!type || !RECEIPT_TYPES[type])
      throw new UserError('Receipts must be an image (JPG, PNG, WebP, HEIC) or a PDF.');
    const key = `${user.id}/${randomUUID()}.${RECEIPT_TYPES[type]}`;
    await putObject(key, buf, type);
    receipt = { key, name: input.receipt.name.slice(0, 120), type };
  }
  const claim = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, 'expense');
    const c = await tx.expenseClaim.create({
      data: {
        code,
        employeeId: user.id,
        date: toDbDate(input.date),
        category: input.category,
        amountPaise: BigInt(input.amountPaise),
        note: input.note.trim(),
        receiptKey: receipt?.key ?? null,
        receiptName: receipt?.name ?? null,
        receiptType: receipt?.type ?? null,
      },
    });
    await writeAudit(tx, user, 'expense.submit', 'ExpenseClaim', c.id, {
      code,
      category: input.category,
      amountPaise: input.amountPaise,
      date: input.date,
    });
    return c;
  });
  const manager = user.managerId ? await db.employee.findUnique({ where: { id: user.managerId } }) : null;
  if (manager) {
    notifyLater([
      {
        to: manager.email,
        subject: `Expense claim from ${user.name}`,
        text: `${user.name} claimed ${formatINR(input.amountPaise)} for ${input.category}: ${input.note}`,
        link: '/approvals',
      },
    ]);
  }
  return claim;
}

/** Manager (or leave.approve_all) approves or rejects a pending claim. */
export async function decideExpense(user: CurrentUser, id: string, approve: boolean, comment: string) {
  const out = await db.$transaction(async (tx) => {
    const c = await tx.expenseClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!c) throw new NotFoundError('Claim');
    if (!canDecide(user, c.employee)) throw new ForbiddenError('approve.team');
    if (c.status !== 'PENDING') throw new UserError('This claim has already been decided.');
    if (!approve && comment.trim().length < 3) throw new UserError('Please give a reason for rejecting.');
    const updated = await tx.expenseClaim.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approverId: user.id,
        comment: comment.trim() || null,
        decidedAt: new Date(),
      },
    });
    await writeAudit(tx, user, approve ? 'expense.approve' : 'expense.reject', 'ExpenseClaim', id, {
      code: c.code,
      comment,
      before: { status: c.status },
      after: { status: updated.status },
    });
    return { c, updated };
  });
  notifyLater([
    {
      to: out.c.employee.email,
      subject: `Your expense claim ${out.c.code} was ${approve ? 'approved' : 'rejected'}`,
      text: `${user.name} ${approve ? 'approved' : 'rejected'} your claim of ${formatINR(out.c.amountPaise)}.${comment ? `\nComment: ${comment}` : ''}`,
      link: '/my/expenses',
    },
  ]);
  return out.updated;
}

/** Finance marks an approved claim as reimbursed (expense.pay). */
export async function reimburseExpense(user: CurrentUser, id: string) {
  requirePermission(user, 'expense.pay');
  const out = await db.$transaction(async (tx) => {
    const c = await tx.expenseClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!c) throw new NotFoundError('Claim');
    if (c.status !== 'APPROVED') throw new UserError('Only approved claims can be reimbursed.');
    if (c.employeeId === user.id) throw new UserError('You cannot reimburse your own claim.');
    const updated = await tx.expenseClaim.update({
      where: { id },
      data: { status: 'REIMBURSED', paidById: user.id, paidAt: new Date() },
    });
    await writeAudit(tx, user, 'expense.reimburse', 'ExpenseClaim', id, {
      code: c.code,
      amountPaise: c.amountPaise,
      before: { status: 'APPROVED' },
      after: { status: 'REIMBURSED' },
    });
    return { c, updated };
  });
  notifyLater([
    {
      to: out.c.employee.email,
      subject: `Expense claim ${out.c.code} reimbursed`,
      text: `Finance reimbursed ${formatINR(out.c.amountPaise)} for your ${out.c.category} claim.`,
      link: '/my/expenses',
    },
  ]);
  return out.updated;
}

/** Receipts are viewable by the claimant, their manager, Finance (expense.pay) and admins (leave.approve_all). */
export async function assertCanViewReceipt(user: CurrentUser, claimId: string) {
  const c = await db.expenseClaim.findUnique({ where: { id: claimId }, include: { employee: true } });
  if (!c || !c.receiptKey) throw new NotFoundError('Receipt');
  const ok =
    c.employeeId === user.id ||
    c.employee.managerId === user.id ||
    user.permissions.has('expense.pay') ||
    user.permissions.has('leave.approve_all');
  if (!ok) throw new ForbiddenError();
  return c;
}
