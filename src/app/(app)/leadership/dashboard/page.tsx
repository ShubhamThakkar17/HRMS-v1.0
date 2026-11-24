import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { executiveDashboard } from '@/server/services/reports';
import { fmtDate, fmtShort } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { Bars, Card, ColumnChart, Kpi, Kpis, PageHead, Stack, Table, Two } from '@/components/ui';

export const metadata = { title: 'Executive dashboard' };

export default async function Dashboard() {
  const user = await requireUser();
  if (!user.permissions.has('dash.exec')) redirect('/');
  const d = await executiveDashboard();
  const totalPunches = d.methodMix.reduce((s, m) => s + m.count, 0);
  const avg = d.rate.length
    ? Math.round(d.rate.slice(0, -1).reduce((s, r) => s + r.pct, 0) / Math.max(1, d.rate.length - 1))
    : 0;
  return (
    <Stack>
      <PageHead title="Executive dashboard" lead={`As of ${fmtDate(d.today)}.`} />
      <Kpis>
        <Kpi label="Headcount" value={d.headcount} sub={`${d.departments.length} departments`} />
        <Kpi
          label="In today"
          value={d.inToday}
          sub={`${d.headcount ? Math.round((d.inToday / d.headcount) * 100) : 0}% of headcount`}
        />
        <Kpi label="Remote today" value={d.remoteToday} />
        <Kpi
          label="Open requests"
          value={d.openRequests}
          sub={`${d.openBreakdown.leave} leave · ${d.openBreakdown.regs} corrections · ${d.openBreakdown.claims} claims`}
          tone={d.openRequests ? 'warn' : undefined}
        />
        <Kpi
          label="Monthly payroll cost"
          value={formatINR(d.payrollPaise, { decimals: false })}
          sub="gross, from CTC"
        />
        <Kpi
          label="Claims this month"
          value={formatINR(d.claimsMonthPaise, { decimals: false })}
          sub={`${d.claimsMonthCount} claim(s)`}
        />
      </Kpis>
      <Card
        title="Attendance rate, last 15 working days"
        extra={<span className="text-[13px] text-muted">average {avg}% (excluding today)</span>}
      >
        <ColumnChart
          points={d.rate.map((r) => ({
            label: fmtShort(r.date).split(' ')[0]!,
            value: r.pct,
            title: `${fmtDate(r.date)}: ${r.present} of ${r.base} in (${r.pct}%)`,
          }))}
        />
      </Card>
      <Two>
        <Card title="Departments">
          <Table rows={d.departments.length} head={['Department', '#People', '#In today', '#Monthly cost']}>
            {d.departments.map((x) => (
              <tr key={x.dept}>
                <td>{x.dept}</td>
                <td className="num">{x.headcount}</td>
                <td className="num">{x.inToday}</td>
                <td className="num">{formatINR(x.ctc, { decimals: false })}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Punch methods this month">
          <Bars
            rows={d.methodMix.map((m) => ({
              label: METHOD_LABEL[m.method] ?? m.method,
              value: m.count,
              display: `${Math.round((m.count / Math.max(1, totalPunches)) * 100)}%`,
            }))}
          />
          <p className="mt-3 text-[13px] text-muted">{totalPunches} check-ins this month.</p>
        </Card>
      </Two>
    </Stack>
  );
}
