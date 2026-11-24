import 'server-only';
import type { Tx } from '../db';
import { fromDbDate, toDbDate, type ISODate } from '@/lib/dates';
import { holidaySetFor } from '@/lib/leave-rules';

/** Holiday dates between from and to that apply to an office (null = company-wide holidays only). */
export async function holidaysFor(
  tx: Tx,
  officeId: string | null,
  from: ISODate,
  to: ISODate,
): Promise<Set<ISODate>> {
  const rows = await tx.holiday.findMany({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } });
  return holidaySetFor(
    rows.map((h) => ({ date: fromDbDate(h.date), officeId: h.officeId })),
    officeId,
  );
}

/** Approved leave dates for an employee in a range. */
export async function approvedLeaveDates(
  tx: Tx,
  employeeId: string,
  from: ISODate,
  to: ISODate,
): Promise<Set<ISODate>> {
  const rows = await tx.leaveRequest.findMany({
    where: { employeeId, status: 'APPROVED', from: { lte: toDbDate(to) }, to: { gte: toDbDate(from) } },
  });
  const out = new Set<ISODate>();
  for (const r of rows) {
    for (let d = fromDbDate(r.from); d <= fromDbDate(r.to); d = nextDay(d))
      if (d >= from && d <= to) out.add(d);
  }
  return out;
}

function nextDay(d: ISODate): ISODate {
  return new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
