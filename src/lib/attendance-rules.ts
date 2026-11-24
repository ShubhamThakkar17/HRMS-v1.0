// Pure attendance rules (Phase 3): rebuild a day's status from its punches.
import { hoursBetween, isWeekend, istTime, minutesOf, type ISODate } from './dates';

export type DayStatusCode = 'PRESENT' | 'LATE' | 'SHORT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND';

export interface ShiftRules {
  start: string;
  end: string;
  lateAfter: string; // HH:mm
  shortDayHours: number;
}

export interface PunchLike {
  at: Date;
  direction: 'IN' | 'OUT';
  method: string;
  officeId: string | null;
  flag: string | null;
}

export interface DayContext {
  date: ISODate;
  shift: ShiftRules;
  isHoliday: boolean;
  onLeave: boolean;
}

export interface DayResult {
  status: DayStatusCode;
  firstIn: Date | null;
  lastOut: Date | null;
  hours: number | null;
  inMethod: string | null;
  outMethod: string | null;
  officeId: string | null;
  remote: boolean;
  flagged: boolean;
}

export function rebuildDay(punches: PunchLike[], ctx: DayContext): DayResult {
  const sorted = [...punches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstInP = sorted.find((p) => p.direction === 'IN') ?? null;
  const outs = firstInP ? sorted.filter((p) => p.direction === 'OUT' && p.at > firstInP.at) : [];
  const lastOutP = outs.length ? outs[outs.length - 1]! : null;
  const firstIn = firstInP?.at ?? null;
  const lastOut = lastOutP?.at ?? null;
  const hours = firstIn && lastOut ? hoursBetween(firstIn, lastOut) : null;
  const base = {
    firstIn,
    lastOut,
    hours,
    inMethod: firstInP?.method ?? null,
    outMethod: lastOutP?.method ?? null,
    officeId: firstInP?.officeId ?? null,
    remote: !!firstInP && !firstInP.officeId && ['GEO', 'FACE'].includes(firstInP.method) && !firstInP.flag,
    flagged: sorted.some((p) => p.flag === 'OUTSIDE_GEOFENCE'),
  };

  if (isWeekend(ctx.date)) return { ...base, status: 'WEEKEND' };
  if (ctx.isHoliday) return { ...base, status: 'HOLIDAY' };
  if (ctx.onLeave) return { ...base, status: 'LEAVE' };
  if (!firstIn) return { ...base, status: 'ABSENT' };
  if (hours !== null && hours < ctx.shift.shortDayHours) return { ...base, status: 'SHORT' };
  if (minutesOf(istTime(firstIn)) > minutesOf(ctx.shift.lateAfter)) return { ...base, status: 'LATE' };
  return { ...base, status: 'PRESENT' };
}

/** Statuses that count as "in" for attendance rate. */
export function countsAsPresent(s: DayStatusCode): boolean {
  return s === 'PRESENT' || s === 'LATE' || s === 'SHORT';
}

export const STATUS_LABEL: Record<DayStatusCode | 'PENDING' | 'UPCOMING' | 'NOT_JOINED', string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  SHORT: 'Short day',
  ABSENT: 'Absent',
  LEAVE: 'On leave',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Weekend',
  PENDING: 'Not checked in',
  UPCOMING: 'Upcoming',
  NOT_JOINED: 'Not joined',
};

export const METHOD_LABEL: Record<string, string> = {
  WEB: 'Web',
  GEO: 'Location',
  FACE: 'Face',
  KIOSK: 'Office code',
  HR: 'HR correction',
  REGULARISED: 'Approved correction',
  DEVICE: 'Biometric device',
};

export type DisplayCode = DayStatusCode | 'PENDING' | 'UPCOMING' | 'NOT_JOINED';

/** What a calendar cell shows for a day, combining the stored AttendanceDay (if any) with the calendar. */
export function displayStatus(input: {
  date: ISODate;
  today: ISODate;
  joinedOn: ISODate;
  stored: DayStatusCode | null;
  isHoliday: boolean;
  onLeave: boolean;
}): DisplayCode {
  const { date, today } = input;
  if (date < input.joinedOn) return 'NOT_JOINED';
  if (input.stored && input.stored !== 'ABSENT') return input.stored;
  if (isWeekend(date)) return 'WEEKEND';
  if (input.isHoliday) return 'HOLIDAY';
  if (input.onLeave) return 'LEAVE';
  if (date > today) return 'UPCOMING';
  if (input.stored === 'ABSENT') return 'ABSENT';
  if (date === today) return 'PENDING';
  return 'ABSENT';
}
