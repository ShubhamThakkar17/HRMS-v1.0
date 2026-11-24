// Payroll preview maths (Phase 10). Preview only: statutory deductions (PF, ESI, PT, TDS) are not computed.
// All amounts are integer paise.

export interface PayslipInput {
  ctcPaise: number;
  workingDays: number; // working days in the month (excludes weekends and holidays)
  lopDays: number; // loss-of-pay days: absent working days + working days before joining
}

export interface Payslip {
  grossPaise: number;
  basicPaise: number;
  hraPaise: number;
  specialPaise: number;
  workingDays: number;
  lopDays: number;
  paidDays: number;
  lopPaise: number;
  netPaise: number;
}

export function monthlyGross(ctcPaise: number): number {
  return Math.round(ctcPaise / 12);
}

export function computePayslip(input: PayslipInput): Payslip {
  const gross = monthlyGross(input.ctcPaise);
  const working = Math.max(0, input.workingDays);
  const lop = Math.min(Math.max(0, input.lopDays), working);
  const lopPaise = working ? Math.round((gross * lop) / working) : 0;
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(gross * 0.2);
  return {
    grossPaise: gross,
    basicPaise: basic,
    hraPaise: hra,
    specialPaise: gross - basic - hra,
    workingDays: working,
    lopDays: lop,
    paidDays: working - lop,
    lopPaise,
    netPaise: gross - lopPaise,
  };
}
