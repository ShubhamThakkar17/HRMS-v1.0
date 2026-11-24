'use server';
import { z } from 'zod';
import { requireUserOrThrow } from '../current-user';
import { act, formObject, type ActionState } from '../action';
import { UserError } from '../errors';
import { applyLeave, cancelLeave, decideLeave } from '../services/leave';
import { applyRegularisation, cancelRegularisation, decideRegularisation } from '../services/regularisation';
import { decideExpense, reimburseExpense, submitExpense } from '../services/expenses';
import { isHHMM, isISODate } from '@/lib/dates';
import { parseRupeesToPaise } from '@/lib/money';

const date = z.string().refine(isISODate, 'Enter a valid date.');
const time = z.string().refine(isHHMM, 'Enter a time as HH:mm.');

export async function applyLeaveAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const v = z
      .object({
        type: z.string().min(1, 'Choose a leave type.'),
        from: date,
        to: date,
        reason: z.string().trim().min(3, 'Give a short reason.').max(500),
      })
      .parse(formObject(fd));
    const r = await applyLeave(user, v);
    return `Request ${r.code} sent for ${r.days} working day(s).`;
  });
}

export async function cancelLeaveAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await cancelLeave(await requireUserOrThrow(), z.string().parse(fd.get('id')));
    return 'Request cancelled.';
  });
}

export async function applyRegAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const v = z
      .object({
        date,
        inTime: time,
        outTime: time,
        reason: z.string().trim().min(3, 'Give a reason.').max(500),
      })
      .parse(formObject(fd));
    const r = await applyRegularisation(user, v);
    return `Correction ${r.code} sent to your manager.`;
  });
}

export async function cancelRegAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await cancelRegularisation(await requireUserOrThrow(), z.string().parse(fd.get('id')));
    return 'Correction cancelled.';
  });
}

export async function submitExpenseAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const v = z
      .object({
        date,
        category: z.string().min(1, 'Choose a category.'),
        amount: z.string(),
        note: z.string().trim().min(3, 'Describe the expense.').max(500),
      })
      .parse(formObject(fd));
    const paise = parseRupeesToPaise(v.amount);
    if (paise === null) throw new UserError('Enter the amount in rupees, for example 1850 or 1850.50.');
    const receipt = fd.get('receipt');
    const c = await submitExpense(user, {
      date: v.date,
      category: v.category,
      amountPaise: paise,
      note: v.note,
      receipt: receipt instanceof File && receipt.size > 0 ? receipt : null,
    });
    return `Claim ${c.code} sent for approval.`;
  });
}

/** One endpoint for the approvals inbox: leave, corrections and claims. */
export async function decideAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const v = z
      .object({
        kind: z.enum(['leave', 'reg', 'expense']),
        id: z.string().min(1),
        decision: z.enum(['approve', 'reject']),
        comment: z.string().max(500).optional().default(''),
      })
      .parse(formObject(fd));
    const approve = v.decision === 'approve';
    if (v.kind === 'leave') await decideLeave(user, v.id, approve, v.comment);
    else if (v.kind === 'reg') await decideRegularisation(user, v.id, approve, v.comment);
    else await decideExpense(user, v.id, approve, v.comment);
    return approve ? 'Approved.' : 'Rejected.';
  });
}

export async function reimburseAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await reimburseExpense(await requireUserOrThrow(), z.string().parse(fd.get('id')));
    return 'Marked as reimbursed.';
  });
}
