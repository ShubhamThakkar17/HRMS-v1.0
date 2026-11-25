import 'server-only';
import type { Employee, Office } from '@prisma/client';
import { db } from '../db';
import { attendanceForMany, type CalendarDay } from './attendance';
import { holidaySetFor, isWorkingDay } from '@/lib/leave-rules';
import { businessDate, eachDay, fromDbDate, monthRange, toDbDate } from '@/lib/dates';
import { computePayslip } from '@/lib/payroll-rules';

type Emp = Employee & { office: Office | null };

function slipFrom(
  e: Emp,
  ym: string,
  days: CalendarDay[],
  holidays: { date: string; officeId: string | null }[],
) {
  const { from, to } = monthRange(ym);
  const today = businessDate();
  const hset = holidaySetFor(holidays, e.officeId);
  const joined = fromDbDate(e.joinedOn);
  const byDate = new Map(days.map((d) => [d.date, d.status]));
  let working = 0;
  let lop = 0;
  let absent = 0;
  let beforeJoin = 0;
  for (const d of eachDay(from, to)) {
    if (!isWorkingDay(d, hset)) continue;
    working++;
    if (d < joined) {
      lop++;
      beforeJoin++;
      continue;
    }
    if (d < today && byDate.get(d) === 'ABSENT') {
      lop++;
      absent++;
    }
  }
  return {
    employee: e,
    ym,
    absentDays: absent,
    beforeJoinDays: beforeJoin,
    ...computePayslip({ ctcPaise: Number(e.ctcPaise), workingDays: working, lopDays: lop }),
  };
}

async function monthHolidays(ym: string) {
  const { from, to } = monthRange(ym);
  const rows = await db.holiday.findMany({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } });
  return rows.map((h) => ({ date: fromDbDate(h.date), officeId: h.officeId }));
}

/** Payroll preview for one employee and month: gross from CTC, LOP from absent working days and days before joining. */
export async function payslipFor(employeeId: string, ym: string) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { office: true } });
  const { from, to } = monthRange(ym);
  const [days, holidays] = await Promise.all([attendanceForMany([e], from, to), monthHolidays(ym)]);
  return slipFrom(e, ym, days.get(e.id)!, holidays);
}

/** Payroll preview for everyone, in a fixed number of queries. */
export async function payrollForMonth(ym: string) {
  const { from, to } = monthRange(ym);
  const emps = await db.employee.findMany({
    where: { status: 'ACTIVE', joinedOn: { lte: toDbDate(to) } },
    orderBy: { code: 'asc' },
    include: { office: true },
  });
  const [days, holidays] = await Promise.all([attendanceForMany(emps, from, to), monthHolidays(ym)]);
  return emps.map((e) => slipFrom(e, ym, days.get(e.id)!, holidays));
}
