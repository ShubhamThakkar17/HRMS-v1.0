import { describe, expect, it } from 'vitest';
import {
  available,
  carryForwardDays,
  countWorkingDays,
  holidaySetFor,
  overlapsExisting,
  remaining,
  validateLeaveApplication,
} from '@/lib/leave-rules';

const holidays = holidaySetFor(
  [
    { date: '2026-12-25', officeId: null },
    { date: '2026-12-28', officeId: 'vdr' },
  ],
  'ho',
);

describe('working-day counting', () => {
  it('counts only working days across a weekend and a holiday', () => {
    // Thu 24 Dec to Tue 29 Dec 2026: Thu, (Fri holiday), (Sat), (Sun), Mon, Tue = 3 days
    expect(countWorkingDays('2026-12-24', '2026-12-29', holidays)).toBe(3);
  });
  it('applies office holidays only to that office', () => {
    const vdr = holidaySetFor([{ date: '2026-12-28', officeId: 'vdr' }], 'vdr');
    expect(countWorkingDays('2026-12-28', '2026-12-28', vdr)).toBe(0);
    expect(countWorkingDays('2026-12-28', '2026-12-28', holidays)).toBe(1);
  });
  it('is zero for a reversed range or a weekend only', () => {
    expect(countWorkingDays('2026-12-29', '2026-12-24', holidays)).toBe(0);
    expect(countWorkingDays('2026-11-28', '2026-11-29', holidays)).toBe(0);
  });
});

describe('overlap', () => {
  const existing = [
    { from: '2026-12-01', to: '2026-12-03', status: 'APPROVED' },
    { from: '2026-12-10', to: '2026-12-10', status: 'PENDING' },
    { from: '2026-12-15', to: '2026-12-16', status: 'REJECTED' },
    { from: '2026-12-20', to: '2026-12-21', status: 'CANCELLED' },
  ];
  it('detects overlap with approved or pending requests', () => {
    expect(overlapsExisting(existing, '2026-12-03', '2026-12-04')).toBe(true);
    expect(overlapsExisting(existing, '2026-12-09', '2026-12-11')).toBe(true);
  });
  it('ignores rejected and cancelled requests and touching ranges', () => {
    expect(overlapsExisting(existing, '2026-12-15', '2026-12-21')).toBe(false);
    expect(overlapsExisting(existing, '2026-12-04', '2026-12-09')).toBe(false);
  });
});

describe('balances', () => {
  const b = { opening: 3, accrued: 12, used: 5 };
  it('computes remaining and available (minus pending)', () => {
    expect(remaining(b)).toBe(10);
    expect(available(b, 4)).toBe(6);
  });
  it('carries forward at most the configured days', () => {
    expect(carryForwardDays({ opening: 0, accrued: 15, used: 2 }, 5)).toBe(5);
    expect(carryForwardDays({ opening: 0, accrued: 15, used: 13 }, 5)).toBe(2);
    expect(carryForwardDays({ opening: 0, accrued: 12, used: 12 }, 5)).toBe(0);
    expect(carryForwardDays({ opening: 0, accrued: 12, used: 3 }, 0)).toBe(0);
  });
});

describe('validateLeaveApplication', () => {
  const base = { holidays, existing: [], balance: { opening: 0, accrued: 12, used: 8 }, pendingDays: 0 };
  it('accepts a valid request and returns working days', () => {
    expect(validateLeaveApplication({ ...base, from: '2026-12-24', to: '2026-12-29' })).toEqual({
      ok: true,
      days: 3,
    });
  });
  it('blocks when available balance (after pending) is too low', () => {
    expect(
      validateLeaveApplication({ ...base, pendingDays: 2, from: '2026-12-21', to: '2026-12-23' }),
    ).toEqual({
      ok: false,
      error: 'INSUFFICIENT_BALANCE',
    });
  });
  it('blocks reversed ranges, weekend-only ranges and overlaps', () => {
    expect(validateLeaveApplication({ ...base, from: '2026-12-29', to: '2026-12-24' })).toMatchObject({
      error: 'END_BEFORE_START',
    });
    expect(validateLeaveApplication({ ...base, from: '2026-12-26', to: '2026-12-27' })).toMatchObject({
      error: 'NO_WORKING_DAYS',
    });
    expect(
      validateLeaveApplication({
        ...base,
        existing: [{ from: '2026-12-24', to: '2026-12-24', status: 'PENDING' }],
        from: '2026-12-24',
        to: '2026-12-24',
      }),
    ).toMatchObject({ error: 'OVERLAP' });
  });
});
