import { fmtMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { payslipFor } from '@/server/services/payroll';

type Slip = Awaited<ReturnType<typeof payslipFor>>;

export function PayslipView({ slip, company }: { slip: Slip; company: string }) {
  const e = slip.employee;
  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap justify-between gap-3 border-b-2 border-brand pb-2.5">
        <div>
          <div className="text-[15px] font-bold tracking-[0.18em] text-brand">{company.toUpperCase()}</div>
          <div className="text-[13px] text-muted">Payslip preview · {fmtMonth(slip.ym)}</div>
        </div>
        <div className="text-right text-sm">
          <strong>{e.name}</strong>
          <div className="text-muted">
            {e.code} · {e.title} · {e.dept}
          </div>
        </div>
      </div>
      <p className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">
        Preview only. Statutory deductions (PF, ESI, professional tax, TDS) are worked out by the payroll
        provider and are not shown.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <table>
          <thead>
            <tr>
              <th className="bg-soft !text-ink">Earnings</th>
              <th className="num bg-soft !text-ink">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic (50%)</td>
              <td className="num">{formatINR(slip.basicPaise)}</td>
            </tr>
            <tr>
              <td>House rent allowance (20%)</td>
              <td className="num">{formatINR(slip.hraPaise)}</td>
            </tr>
            <tr>
              <td>Special allowance (30%)</td>
              <td className="num">{formatINR(slip.specialPaise)}</td>
            </tr>
            <tr className="font-semibold">
              <td>Gross</td>
              <td className="num">{formatINR(slip.grossPaise)}</td>
            </tr>
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th className="bg-soft !text-ink">Attendance</th>
              <th className="num bg-soft !text-ink">Days</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Working days</td>
              <td className="num">{slip.workingDays}</td>
            </tr>
            <tr>
              <td>Loss of pay (absent{slip.beforeJoinDays ? ', before joining' : ''})</td>
              <td className="num">{slip.lopDays}</td>
            </tr>
            <tr>
              <td>Paid days</td>
              <td className="num">{slip.paidDays}</td>
            </tr>
            <tr>
              <td>Loss-of-pay deduction</td>
              <td className="num">−{formatINR(slip.lopPaise)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-soft px-4 py-3">
        <span className="font-medium">Net before statutory deductions</span>
        <strong className="text-xl tabular-nums">{formatINR(slip.netPaise)}</strong>
      </div>
      <p className="text-[13px] text-muted">
        Annual CTC {formatINR(e.ctcPaise)}. Loss of pay = gross ÷ working days × LOP days. Days not yet worked
        this month are not counted as absent.
      </p>
    </div>
  );
}
