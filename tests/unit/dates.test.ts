import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessDate,
  daysInMonth,
  eachDay,
  fmtDate,
  fromDbDate,
  hoursBetween,
  isISODate,
  istInstant,
  istTime,
  isWeekend,
  monthRange,
  shiftMonth,
  toDbDate,
} from '@/lib/dates';

describe('dates (IST)', () => {
  it('maps instants to IST business dates across midnight', () => {
    expect(businessDate(new Date('2026-11-23T18:29:00Z'))).toBe('2026-11-23');
    expect(businessDate(new Date('2026-11-23T18:31:00Z'))).toBe('2026-11-24');
  });
  it('converts IST wall-clock times to instants and back', () => {
    const at = istInstant('2026-11-24', '09:41');
    expect(at.toISOString()).toBe('2026-11-24T04:11:00.000Z');
    expect(istTime(at)).toBe('09:41');
  });
  it('round-trips db dates', () => {
    expect(fromDbDate(toDbDate('2026-02-28'))).toBe('2026-02-28');
    expect(() => toDbDate('2026-02-30')).toThrow();
  });
  it('validates ISO dates', () => {
    expect(isISODate('2026-11-24')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('24-11-2026')).toBe(false);
  });
  it('does calendar arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(eachDay('2026-11-28', '2026-12-01')).toHaveLength(4);
    expect(isWeekend('2026-11-28')).toBe(true); // Saturday
    expect(isWeekend('2026-11-24')).toBe(false); // Tuesday
    expect(daysInMonth('2028-02')).toBe(29);
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('rounds hours to a tenth', () => {
    expect(hoursBetween(istInstant('2026-11-24', '09:30'), istInstant('2026-11-24', '18:15'))).toBe(8.8);
  });
  it('formats dates', () => {
    expect(fmtDate('2026-11-04')).toBe('04 Nov 2026');
  });
});
