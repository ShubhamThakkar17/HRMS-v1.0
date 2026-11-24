import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { payrollForMonth } from '@/server/services/payroll';
import { getSetting } from '@/server/settings';
import { businessDate, fmtMonth, isValidMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { PayslipView } from '@/components/payslip';
import { PrintButton } from '@/components/print-button';
import { Card, Kpi, Kpis, MonthNav, Notice, PageHead, Stack, Table } from '@/components/ui';

export const metadata = { title: 'Payroll preview' };

export default async function Payroll({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; slip?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('payroll.view')) redirect('/');
  const sp = await searchParams;
  const ym = sp.month && isValidMonth(sp.month) ? sp.month : businessDate().slice(0, 7);
  const [rows, company] = await Promise.all([payrollForMonth(ym), getSetting('company')]);
  const slip = sp.slip ? rows.find((r) => r.employee.id === sp.slip) : null;
  const sum = (k: 'grossPaise' | 'lopPaise' | 'netPaise') => rows.reduce((s, r) => s + r[k], 0);
  if (slip) {
    return (
      <Stack>
        <PageHead
          title={`Payslip preview · ${slip.employee.name}`}
          actions={
            <>
              <Link className="btn btn-ghost" href={`/finance/payroll?month=${ym}`}>
                Back
              </Link>
              <PrintButton />
            </>
          }
        />
        <Card>
          <PayslipView slip={slip} company={company.name} />
        </Card>
      </Stack>
    );
  }
  return (
    <Stack>
      <PageHead
        title="Payroll preview"
        lead="Monthly gross from CTC, loss of pay from attendance. Not a statutory payroll run."
        actions={<MonthNav ym={ym} label={fmtMonth(ym)} base="/finance/payroll" />}
      />
      <Notice>Preview only. PF, ESI, professional tax and TDS stay with the payroll provider.</Notice>
      <Kpis>
        <Kpi label="People" value={rows.length} />
        <Kpi label="Gross" value={formatINR(sum('grossPaise'))} />
        <Kpi
          label="Loss of pay"
          value={formatINR(sum('lopPaise'))}
          sub={`${rows.reduce((s, r) => s + r.lopDays, 0)} day(s)`}
        />
        <Kpi label="Net before deductions" value={formatINR(sum('netPaise'))} />
      </Kpis>
      <Card title={fmtMonth(ym)}>
        <Table
          rows={rows.length}
          head={['ID', 'Name', 'Department', '#Gross', '#Working', '#LOP days', '#LOP', '#Net', '']}
        >
          {rows.map((r) => (
            <tr key={r.employee.id}>
              <td className="font-mono text-[13px]">{r.employee.code}</td>
              <td>{r.employee.name}</td>
              <td>{r.employee.dept}</td>
              <td className="num">{formatINR(r.grossPaise)}</td>
              <td className="num">{r.workingDays}</td>
              <td className="num">{r.lopDays}</td>
              <td className="num">{formatINR(r.lopPaise)}</td>
              <td className="num font-semibold">{formatINR(r.netPaise)}</td>
              <td>
                <Link href={`/finance/payroll?month=${ym}&slip=${r.employee.id}`}>Payslip</Link>
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={3}>Total</td>
            <td className="num">{formatINR(sum('grossPaise'))}</td>
            <td />
            <td className="num">{rows.reduce((s, r) => s + r.lopDays, 0)}</td>
            <td className="num">{formatINR(sum('lopPaise'))}</td>
            <td className="num">{formatINR(sum('netPaise'))}</td>
            <td />
          </tr>
        </Table>
      </Card>
    </Stack>
  );
}
