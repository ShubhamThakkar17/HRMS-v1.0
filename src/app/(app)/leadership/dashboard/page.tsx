import { redirect } from 'next/navigation';
import {
  Building2,
  ClipboardCheck,
  Fingerprint,
  Home,
  IndianRupee,
  LineChart,
  ReceiptText,
  Users,
} from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { executiveDashboard } from '@/server/services/reports';
import { fmtDate, fmtShort } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { Card, Kpi, Kpis, PageHead, Stack, Two } from '@/components/ui';
import { AreaChart, BarList, Columns, Donut, Legend, PALETTE, Ring, Sparkline } from '@/components/charts';
import { CountUp } from '@/components/count-up';

export const metadata = { title: 'Executive dashboard' };

export default async function Dashboard() {
  const user = await requireUser();
  if (!user.permissions.has('dash.exec')) redirect('/');
  const d = await executiveDashboard();
  const totalPunches = d.methodMix.reduce((s, m) => s + m.count, 0);
  const past = d.rate.slice(0, -1);
  const avg = past.length ? Math.round(past.reduce((s, r) => s + r.pct, 0) / past.length) : 0;
  const inPct = d.headcount ? d.inToday / d.headcount : 0;
  const methods = d.methodMix.map((m, i) => ({
    label: METHOD_LABEL[m.method] ?? m.method,
    value: m.count,
    color: PALETTE[i % PALETTE.length],
  }));
  return (
    <Stack>
      <PageHead
        eyebrow="Leadership"
        title="Executive dashboard"
        lead={`Live view of the company as of ${fmtDate(d.today)}.`}
      />
      <Kpis>
        <Kpi
          label="Headcount"
          icon={<Users />}
          value={<CountUp value={d.headcount} />}
          sub={`${d.departments.length} departments`}
        />
        <Kpi
          label="In today"
          icon={<Fingerprint />}
          tone="good"
          value={<CountUp value={d.inToday} />}
          sub={`${Math.round(inPct * 100)}% of headcount`}
          chart={<Ring value={inPct} size={44} thickness={5} color="var(--c2)" />}
        />
        <Kpi
          label="Remote today"
          icon={<Home />}
          value={<CountUp value={d.remoteToday} />}
          sub="outside an office"
        />
        <Kpi
          label="Open requests"
          icon={<ClipboardCheck />}
          tone={d.openRequests ? 'warn' : undefined}
          value={<CountUp value={d.openRequests} />}
          sub={`${d.openBreakdown.leave} leave · ${d.openBreakdown.regs} fixes · ${d.openBreakdown.claims} claims`}
        />
        <Kpi
          label="Monthly payroll"
          icon={<IndianRupee />}
          value={<CountUp value={d.payrollPaise / 100} format="inr" />}
          sub="gross, from CTC"
        />
        <Kpi
          label="Claims this month"
          icon={<ReceiptText />}
          value={<CountUp value={d.claimsMonthPaise / 100} format="inr" />}
          sub={`${d.claimsMonthCount} claim(s)`}
        />
      </Kpis>

      <Two wide>
        <Card
          title="Attendance rate"
          sub="Last 15 working days"
          icon={<LineChart />}
          extra={
            <div className="flex items-center gap-2 text-right">
              <Sparkline values={d.rate.map((r) => r.pct)} />
              <div>
                <div className="text-xl font-semibold">{avg}%</div>
                <div className="text-xs text-muted">average</div>
              </div>
            </div>
          }
        >
          <AreaChart
            points={d.rate.map((r) => ({
              label: fmtShort(r.date).split(' ')[0]!,
              value: r.pct,
              title: `${fmtDate(r.date)}: ${r.present} of ${r.base} in (${r.pct}%)`,
            }))}
          />
        </Card>
        <Card title="How people punch" sub="Check-ins this month" icon={<Fingerprint />}>
          <div className="grid justify-items-center gap-5">
            <Donut segments={methods} center={totalPunches} sub="check-ins" />
            <Legend items={methods} values />
          </div>
        </Card>
      </Two>

      <Two>
        <Card title="Headcount by department" icon={<Building2 />}>
          <Columns
            bars={d.departments.map((x) => ({
              label: x.dept,
              value: x.headcount,
              title: `${x.dept}: ${x.headcount} people, ${x.inToday} in today`,
            }))}
          />
        </Card>
        <Card title="Monthly cost by department" sub="Gross pay from CTC" icon={<IndianRupee />}>
          <BarList
            rows={[...d.departments]
              .sort((a, b) => b.ctc - a.ctc)
              .map((x) => ({
                label: x.dept,
                value: x.ctc,
                display: formatINR(x.ctc, { decimals: false }),
                hint: `${x.inToday}/${x.headcount} in`,
              }))}
          />
        </Card>
      </Two>
    </Stack>
  );
}
