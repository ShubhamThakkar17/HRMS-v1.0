import 'server-only';
import { db } from '../db';
import { statusOn } from './attendance';
import { addDays, businessDate, fromDbDate, monthRange, toDbDate, type ISODate } from '@/lib/dates';
import { countsAsPresent, type DayStatusCode } from '@/lib/attendance-rules';
import { isWorkingDay } from '@/lib/leave-rules';
import { monthlyGross } from '@/lib/payroll-rules';

async function companyHolidays(from: ISODate, to: ISODate) {
  const rows = await db.holiday.findMany({
    where: { officeId: null, date: { gte: toDbDate(from), lte: toDbDate(to) } },
  });
  return new Set(rows.map((h) => fromDbDate(h.date)));
}

/** The last n working days up to and including `until`. */
export async function lastWorkingDays(n: number, until = businessDate()) {
  const holidays = await companyHolidays(addDays(until, -n * 3), until);
  const out: ISODate[] = [];
  for (let d = until; out.length < n; d = addDays(d, -1)) if (isWorkingDay(d, holidays)) out.unshift(d);
  return out;
}

export async function executiveDashboard() {
  const today = businessDate();
  const ym = today.slice(0, 7);
  const { from, to } = monthRange(ym);
  const emps = await db.employee.findMany({ where: { status: 'ACTIVE' } });
  const ids = emps.map((e) => e.id);
  const todayStatus = await statusOn(ids, today);
  let inToday = 0;
  let remoteToday = 0;
  for (const s of todayStatus.values()) {
    if (s.row?.firstIn) {
      inToday++;
      if (s.row.remote) remoteToday++;
    }
  }
  const [openLeave, openRegs, openClaims, claimsMonth, punchesMonth] = await Promise.all([
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.regularisation.count({ where: { status: 'PENDING' } }),
    db.expenseClaim.count({ where: { status: 'PENDING' } }),
    db.expenseClaim.aggregate({
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) }, status: { not: 'REJECTED' } },
      _sum: { amountPaise: true },
      _count: true,
    }),
    db.punch.groupBy({
      by: ['method'],
      where: { direction: 'IN', businessDate: { gte: toDbDate(from), lte: toDbDate(to) } },
      _count: true,
    }),
  ]);
  const payrollPaise = emps.reduce((s, e) => s + monthlyGross(Number(e.ctcPaise)), 0);

  // Attendance rate for the last 15 working days (today counts check-ins so far).
  const days = await lastWorkingDays(15, today);
  const rows = await db.attendanceDay.findMany({
    where: { businessDate: { gte: toDbDate(days[0]!), lte: toDbDate(today) }, employeeId: { in: ids } },
  });
  const rate = days.map((d) => {
    const eligible = emps.filter((e) => fromDbDate(e.joinedOn) <= d);
    const onLeave = rows.filter((r) => fromDbDate(r.businessDate) === d && r.status === 'LEAVE').length;
    const present = rows.filter(
      (r) => fromDbDate(r.businessDate) === d && countsAsPresent(r.status as DayStatusCode),
    ).length;
    const base = Math.max(1, eligible.length - onLeave);
    return { date: d, present, base, pct: Math.round((present / base) * 100) };
  });

  const depts = new Map<string, { headcount: number; inToday: number; ctc: number }>();
  for (const e of emps) {
    const d = depts.get(e.dept) ?? { headcount: 0, inToday: 0, ctc: 0 };
    d.headcount++;
    if (todayStatus.get(e.id)?.row?.firstIn) d.inToday++;
    d.ctc += monthlyGross(Number(e.ctcPaise));
    depts.set(e.dept, d);
  }
  return {
    today,
    headcount: emps.length,
    inToday,
    remoteToday,
    openRequests: openLeave + openRegs + openClaims,
    openBreakdown: { leave: openLeave, regs: openRegs, claims: openClaims },
    payrollPaise,
    claimsMonthPaise: Number(claimsMonth._sum.amountPaise ?? 0n),
    claimsMonthCount: claimsMonth._count,
    rate,
    departments: [...depts.entries()]
      .map(([dept, v]) => ({ dept, ...v }))
      .sort((a, b) => b.headcount - a.headcount),
    methodMix: punchesMonth
      .map((p) => ({ method: p.method, count: p._count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function reports(ym: string) {
  const { from, to } = monthRange(ym);
  const today = businessDate();
  const year = Number(ym.slice(0, 4));
  const emps = await db.employee.findMany({ where: { status: 'ACTIVE' } });
  const headcount = new Map<string, number>();
  for (const e of emps) headcount.set(e.dept, (headcount.get(e.dept) ?? 0) + 1);

  const [leaveByType, types, days, expenses] = await Promise.all([
    db.leaveRequest.groupBy({
      by: ['type'],
      where: { status: 'APPROVED', from: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) } },
      _sum: { days: true },
      _count: true,
    }),
    db.leaveType.findMany(),
    db.attendanceDay.findMany({
      where: { businessDate: { gte: toDbDate(from), lte: toDbDate(to < today ? to : today) } },
      include: { employee: { select: { dept: true, status: true } } },
    }),
    db.expenseClaim.groupBy({
      by: ['category', 'status'],
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
      _sum: { amountPaise: true },
      _count: true,
    }),
  ]);
  const holidays = await companyHolidays(from, to);
  const deptAtt = new Map<string, { present: number; late: number; absent: number; expected: number }>();
  for (const e of emps) {
    const d = deptAtt.get(e.dept) ?? { present: 0, late: 0, absent: 0, expected: 0 };
    const joined = fromDbDate(e.joinedOn);
    for (let x = from; x <= to && x < today; x = addDays(x, 1))
      if (isWorkingDay(x, holidays) && x >= joined) d.expected++;
    deptAtt.set(e.dept, d);
  }
  for (const r of days) {
    if (r.employee.status !== 'ACTIVE') continue;
    const d = deptAtt.get(r.employee.dept);
    if (!d) continue;
    if (countsAsPresent(r.status as DayStatusCode)) d.present++;
    if (r.status === 'LATE') d.late++;
    if (r.status === 'ABSENT') d.absent++;
    if (r.status === 'LEAVE') d.expected--;
  }
  const byCat = new Map<string, { amount: number; count: number; reimbursed: number }>();
  for (const x of expenses) {
    if (x.status === 'REJECTED') continue;
    const c = byCat.get(x.category) ?? { amount: 0, count: 0, reimbursed: 0 };
    c.amount += Number(x._sum.amountPaise ?? 0n);
    c.count += x._count;
    if (x.status === 'REIMBURSED') c.reimbursed += Number(x._sum.amountPaise ?? 0n);
    byCat.set(x.category, c);
  }
  return {
    headcount: [...headcount.entries()].map(([dept, n]) => ({ dept, n })).sort((a, b) => b.n - a.n),
    leaveByType: types.map((t) => {
      const g = leaveByType.find((x) => x.type === t.code);
      return { code: t.code, name: t.name, days: g?._sum.days ?? 0, requests: g?._count ?? 0 };
    }),
    attendance: [...deptAtt.entries()]
      .map(([dept, v]) => ({
        dept,
        ...v,
        rate: v.expected > 0 ? Math.round((v.present / v.expected) * 100) : null,
      }))
      .sort((a, b) => a.dept.localeCompare(b.dept)),
    expenses: [...byCat.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}
