import { describe, expect, it } from 'vitest';
import { displayStatus, rebuildDay, type PunchLike } from '@/lib/attendance-rules';
import { istInstant } from '@/lib/dates';

const shift = { start: '09:30', end: '18:30', lateAfter: '09:40', shortDayHours: 4.5 };
const TUE = '2026-11-24';
const SAT = '2026-11-28';
const p = (time: string, direction: 'IN' | 'OUT', extra: Partial<PunchLike> = {}, date = TUE): PunchLike => ({
  at: istInstant(date, time),
  direction,
  method: 'WEB',
  officeId: 'ho',
  flag: null,
  ...extra,
});
const ctx = (over = {}) => ({ date: TUE, shift, isHoliday: false, onLeave: false, ...over });

describe('rebuildDay status rules', () => {
  it('is Present when in by the late threshold with a full day', () => {
    const r = rebuildDay([p('09:40', 'IN'), p('18:30', 'OUT')], ctx());
    expect(r.status).toBe('PRESENT');
    expect(r.hours).toBe(8.8);
  });
  it('is Late for a punch after the late threshold', () => {
    expect(rebuildDay([p('09:41', 'IN'), p('18:30', 'OUT')], ctx()).status).toBe('LATE');
  });
  it('is Late while still checked in after a late arrival', () => {
    const r = rebuildDay([p('10:05', 'IN')], ctx());
    expect(r.status).toBe('LATE');
    expect(r.hours).toBeNull();
  });
  it('is Short day under the short-day hours (and short wins over late)', () => {
    expect(rebuildDay([p('09:30', 'IN'), p('13:30', 'OUT')], ctx()).status).toBe('SHORT');
    expect(rebuildDay([p('11:00', 'IN'), p('15:00', 'OUT')], ctx()).status).toBe('SHORT');
    expect(rebuildDay([p('09:30', 'IN'), p('14:00', 'OUT')], ctx()).status).toBe('PRESENT'); // exactly 4.5 h
  });
  it('is Absent with no IN punch', () => {
    expect(rebuildDay([], ctx()).status).toBe('ABSENT');
    expect(rebuildDay([p('18:00', 'OUT')], ctx()).status).toBe('ABSENT');
  });
  it('applies weekend, holiday and approved leave before punches', () => {
    expect(rebuildDay([p('09:30', 'IN', {}, SAT)], ctx({ date: SAT })).status).toBe('WEEKEND');
    expect(rebuildDay([], ctx({ isHoliday: true })).status).toBe('HOLIDAY');
    expect(rebuildDay([], ctx({ onLeave: true })).status).toBe('LEAVE');
  });
  it('uses the first IN and the last OUT after it', () => {
    const r = rebuildDay([p('18:00', 'OUT'), p('09:10', 'IN'), p('13:00', 'OUT'), p('18:45', 'OUT')], ctx());
    expect(r.hours).toBe(9.6);
  });
  it('marks remote and flagged days', () => {
    expect(rebuildDay([p('09:30', 'IN', { method: 'GEO', officeId: null })], ctx()).remote).toBe(true);
    const flagged = rebuildDay(
      [p('09:30', 'IN', { method: 'GEO', officeId: null, flag: 'OUTSIDE_GEOFENCE' })],
      ctx(),
    );
    expect(flagged.flagged).toBe(true);
    expect(flagged.remote).toBe(false);
  });
});

describe('displayStatus', () => {
  const base = { today: TUE, joinedOn: '2020-01-01', stored: null, isHoliday: false, onLeave: false };
  it('shows not-checked-in today and absent for past blank days', () => {
    expect(displayStatus({ ...base, date: TUE })).toBe('PENDING');
    expect(displayStatus({ ...base, date: '2026-11-23' })).toBe('ABSENT');
    expect(displayStatus({ ...base, date: '2026-11-25' })).toBe('UPCOMING');
  });
  it('prefers stored status, and calendar facts over a stored absent', () => {
    expect(displayStatus({ ...base, date: '2026-11-23', stored: 'LATE' })).toBe('LATE');
    expect(displayStatus({ ...base, date: '2026-11-23', stored: 'ABSENT', onLeave: true })).toBe('LEAVE');
  });
  it('shows not joined before the join date', () => {
    expect(displayStatus({ ...base, date: '2026-11-23', joinedOn: '2026-11-24' })).toBe('NOT_JOINED');
  });
});
