import { describe, expect, it } from 'vitest';
import { computePayslip, monthlyGross } from '@/lib/payroll-rules';

describe('payroll preview maths', () => {
  it('derives monthly gross from annual CTC', () => {
    expect(monthlyGross(1_200_000_00)).toBe(100_000_00);
    expect(monthlyGross(1_000)).toBe(83); // rounds to the nearest paisa
  });
  it('splits gross into basic 50%, HRA 20%, special as the remainder', () => {
    const s = computePayslip({ ctcPaise: 1_200_000_00, workingDays: 21, lopDays: 0 });
    expect(s.basicPaise).toBe(50_000_00);
    expect(s.hraPaise).toBe(20_000_00);
    expect(s.specialPaise).toBe(30_000_00);
    expect(s.basicPaise + s.hraPaise + s.specialPaise).toBe(s.grossPaise);
    expect(s.netPaise).toBe(s.grossPaise);
  });
  it('deducts loss of pay pro rata over working days', () => {
    const s = computePayslip({ ctcPaise: 1_200_000_00, workingDays: 20, lopDays: 2 });
    expect(s.lopPaise).toBe(10_000_00);
    expect(s.netPaise).toBe(90_000_00);
    expect(s.paidDays).toBe(18);
  });
  it('caps LOP at working days and handles zero working days', () => {
    expect(computePayslip({ ctcPaise: 600_000_00, workingDays: 10, lopDays: 15 }).netPaise).toBe(0);
    expect(computePayslip({ ctcPaise: 600_000_00, workingDays: 0, lopDays: 0 }).lopPaise).toBe(0);
  });
});
