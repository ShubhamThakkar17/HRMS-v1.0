import { NextResponse } from 'next/server';
import { requireUserOrThrow } from '@/server/current-user';
import { apiError } from '@/server/api';
import { requirePermission } from '@/server/rbac';
import { db } from '@/server/db';
import { toCsv } from '@/lib/csv';
import { businessDate, fromDbDate } from '@/lib/dates';
import { paiseToRupeesString } from '@/lib/money';

export async function GET(req: Request) {
  try {
    const user = await requireUserOrThrow();
    requirePermission(user, 'expense.pay');
    const status = new URL(req.url).searchParams.get('status');
    const valid = ['PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED'] as const;
    const s = valid.find((v) => v === status);
    const rows = await db.expenseClaim.findMany({
      where: s ? { status: s } : {},
      include: { employee: true, approver: true, paidBy: true },
      orderBy: { date: 'asc' },
    });
    const csv = toCsv([
      [
        'Claim ID',
        'Emp ID',
        'Name',
        'Department',
        'Date',
        'Category',
        'Amount (INR)',
        'Details',
        'Status',
        'Approved by',
        'Reimbursed by',
        'Comment',
      ],
      ...rows.map((x) => [
        x.code,
        x.employee.code,
        x.employee.name,
        x.employee.dept,
        fromDbDate(x.date),
        x.category,
        paiseToRupeesString(x.amountPaise),
        x.note,
        x.status,
        x.approver?.name,
        x.paidBy?.name,
        x.comment,
      ]),
    ]);
    return new NextResponse('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="expenses-${businessDate()}.csv"`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
