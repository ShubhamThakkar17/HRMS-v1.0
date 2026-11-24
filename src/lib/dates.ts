// All date handling goes through this file (CLAUDE.md rule 3).
// Business dates are 'YYYY-MM-DD' strings in IST; Prisma @db.Date values are UTC-midnight Date objects.
// India has no daylight saving, so IST is a fixed +05:30 offset.

export const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

export type ISODate = string; // YYYY-MM-DD

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** The IST calendar date of an instant. */
export function businessDate(at: Date = new Date()): ISODate {
  return new Date(at.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** IST wall-clock time HH:mm of an instant. */
export function istTime(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(11, 16);
}

/** The instant for an IST date and HH:mm wall-clock time. */
export function istInstant(date: ISODate, hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const base = Date.parse(`${date}T00:00:00Z`);
  return new Date(base + (h * 60 + m - IST_OFFSET_MIN) * 60_000);
}

/** Business date → value for a Prisma @db.Date column. */
export function toDbDate(date: ISODate): Date {
  if (!isISODate(date)) throw new Error(`Invalid date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

/** Prisma @db.Date value → business date. */
export function fromDbDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: ISODate, n: number): ISODate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayIndex(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: ISODate): boolean {
  const d = weekdayIndex(date);
  return d === 0 || d === 6;
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export function monthRange(ym: string): { from: ISODate; to: ISODate } {
  return { from: `${ym}-01`, to: `${ym}-${pad(daysInMonth(ym))}` };
}

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function isValidMonth(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Hours between two instants, rounded to 0.1 h. */
export function hoursBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 360_000) / 10;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 24 Nov 2026 */
export function fmtDate(date: ISODate | null | undefined): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** 24 Nov */
export function fmtShort(date: ISODate | null | undefined): string {
  if (!date) return '';
  const [, m, d] = date.split('-');
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

export function fmtWeekday(date: ISODate): string {
  return WEEKDAYS[weekdayIndex(date)]!;
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS_LONG[Number(m) - 1]} ${y}`;
}

/** 24 Nov 2026, 09:31 IST */
export function fmtDateTime(at: Date | null | undefined): string {
  if (!at) return '';
  return `${fmtDate(businessDate(at))}, ${istTime(at)}`;
}
