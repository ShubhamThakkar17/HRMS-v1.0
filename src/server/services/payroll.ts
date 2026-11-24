import 'server-only';
import { db } from '../db';
import { attendanceMonth } from './attendance';
import { holidaysFor } from './calendar';
import { businessDate, eachDay, fromDbDate, monthRange } from '@/lib/dates';
import { isWorkingDay } from '@/lib/leave-rules';
import { computePayslip } from '@/lib/payroll-rules';

/** Payroll preview for one employee and month: gross from CTC, LOP from absent working days and days before joining. */
export async function payslipFor(employeeId: string, ym: string) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { office: true } });
  const { from, to } = monthRange(ym);
  const today = businessDate();
  const holidays = await holidaysFor(db, e.officeId, from, to);
  const days = await attendanceMonth(employeeId, ym);
  const joined = fromDbDate(e.joinedOn);
  let working = 0;
  let lop = 0;
  let absent = 0;
  let beforeJoin = 0;
  for (const d of eachDay(from, to)) {
    if (!isWorkingDay(d, holidays)) continue;
    working++;
    if (d < joined) {
      lop++;
      beforeJoin++;
      continue;
    }
    const st = days.find((x) => x.date === d)?.status;
    if (d < today && st === 'ABSENT') {
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

export async function payrollForMonth(ym: string) {
  const { to } = monthRange(ym);
  const emps = await db.employee.findMany({
    where: { status: 'ACTIVE', joinedOn: { lte: new Date(`${to}T00:00:00Z`) } },
    orderBy: { code: 'asc' },
  });
  const rows = [];
  for (const e of emps) rows.push(await payslipFor(e.id, ym));
  return rows;
}
