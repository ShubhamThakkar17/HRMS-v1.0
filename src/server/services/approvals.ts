import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { CurrentUser } from '../rbac';

/** Who the user may decide for: everyone (leave.approve_all), direct reports (approve.team), or nobody. */
function requesterFilter(user: CurrentUser): Prisma.EmployeeWhereInput | null {
  if (user.permissions.has('leave.approve_all')) return { id: { not: user.id } };
  if (user.permissions.has('approve.team')) return { managerId: user.id };
  return null;
}

export async function approvalsInbox(user: CurrentUser) {
  const who = requesterFilter(user);
  const include = { employee: { select: { id: true, code: true, name: true, dept: true, managerId: true } } };
  const [leaves, regs, expenses, toPay] = await Promise.all([
    who
      ? db.leaveRequest.findMany({
          where: { status: 'PENDING', employee: who },
          include,
          orderBy: { from: 'asc' },
        })
      : [],
    who
      ? db.regularisation.findMany({
          where: { status: 'PENDING', employee: who },
          include,
          orderBy: { date: 'asc' },
        })
      : [],
    who
      ? db.expenseClaim.findMany({
          where: { status: 'PENDING', employee: who },
          include,
          orderBy: { date: 'asc' },
        })
      : [],
    user.permissions.has('expense.pay')
      ? db.expenseClaim.findMany({
          where: { status: 'APPROVED', employeeId: { not: user.id } },
          include,
          orderBy: { date: 'asc' },
        })
      : [],
  ]);
  return {
    leaves,
    regs,
    expenses,
    toPay,
    count: leaves.length + regs.length + expenses.length + toPay.length,
  };
}

export async function approvalsCount(user: CurrentUser): Promise<number> {
  const who = requesterFilter(user);
  const [a, b, c, d] = await Promise.all([
    who ? db.leaveRequest.count({ where: { status: 'PENDING', employee: who } }) : 0,
    who ? db.regularisation.count({ where: { status: 'PENDING', employee: who } }) : 0,
    who ? db.expenseClaim.count({ where: { status: 'PENDING', employee: who } }) : 0,
    user.permissions.has('expense.pay')
      ? db.expenseClaim.count({ where: { status: 'APPROVED', employeeId: { not: user.id } } })
      : 0,
  ]);
  return a + b + c + d;
}
