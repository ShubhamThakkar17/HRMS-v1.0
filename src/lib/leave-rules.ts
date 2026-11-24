// Pure leave rules (Phase 7). Working days exclude weekends and holidays.
import { eachDay, isWeekend, type ISODate } from './dates';

export interface HolidayLike {
  date: ISODate;
  officeId: string | null;
}

/** Holidays that apply to an employee's office (null officeId = all offices). */
export function holidaySetFor(holidays: HolidayLike[], officeId: string | null): Set<ISODate> {
  return new Set(holidays.filter((h) => h.officeId === null || h.officeId === officeId).map((h) => h.date));
}

export function isWorkingDay(date: ISODate, holidays: Set<ISODate>): boolean {
  return !isWeekend(date) && !holidays.has(date);
}

export function countWorkingDays(from: ISODate, to: ISODate, holidays: Set<ISODate>): number {
  if (to < from) return 0;
  return eachDay(from, to).filter((d) => isWorkingDay(d, holidays)).length;
}

export interface RangeLike {
  from: ISODate;
  to: ISODate;
  status: string;
}

/** True when [from, to] overlaps any pending or approved request. */
export function overlapsExisting(existing: RangeLike[], from: ISODate, to: ISODate): boolean {
  return existing.some(
    (r) => (r.status === 'PENDING' || r.status === 'APPROVED') && r.from <= to && r.to >= from,
  );
}

export interface BalanceLike {
  opening: number;
  accrued: number;
  used: number;
}

export function remaining(b: BalanceLike): number {
  return b.opening + b.accrued - b.used;
}

/** Available = balance minus pending requests. */
export function available(b: BalanceLike, pendingDays: number): number {
  return remaining(b) - pendingDays;
}

/** Days carried into the next year: what is left, capped at the type's carry-forward limit. */
export function carryForwardDays(b: BalanceLike, carryLimit: number): number {
  return Math.max(0, Math.min(remaining(b), carryLimit));
}

export type ApplyError = 'END_BEFORE_START' | 'NO_WORKING_DAYS' | 'OVERLAP' | 'INSUFFICIENT_BALANCE';

export function validateLeaveApplication(input: {
  from: ISODate;
  to: ISODate;
  holidays: Set<ISODate>;
  existing: RangeLike[];
  balance: BalanceLike;
  pendingDays: number;
}): { ok: true; days: number } | { ok: false; error: ApplyError } {
  if (input.to < input.from) return { ok: false, error: 'END_BEFORE_START' };
  const days = countWorkingDays(input.from, input.to, input.holidays);
  if (days === 0) return { ok: false, error: 'NO_WORKING_DAYS' };
  if (overlapsExisting(input.existing, input.from, input.to)) return { ok: false, error: 'OVERLAP' };
  if (available(input.balance, input.pendingDays) < days) return { ok: false, error: 'INSUFFICIENT_BALANCE' };
  return { ok: true, days };
}

export const APPLY_ERROR_TEXT: Record<ApplyError, string> = {
  END_BEFORE_START: 'The end date is before the start date.',
  NO_WORKING_DAYS: 'Those dates fall only on weekends or holidays.',
  OVERLAP: 'You already have leave booked or pending on some of those dates.',
  INSUFFICIENT_BALANCE: 'Not enough leave available for that many days.',
};
