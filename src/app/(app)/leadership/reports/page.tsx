import { redirect } from 'next/navigation';
import { BarChart3, CalendarHeart, ClipboardList, ReceiptText, Users } from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { reports } from '@/server/services/reports';
import { businessDate, fmtMonth, isValidMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { Card, Empty, MonthNav, PageHead, Stack, Table, Two } from '@/components/ui';
import { BarList, Columns, Donut, Legend, PALETTE } from '@/components/charts';

export const metadata = { title: 'Reports' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  if (!user.permissions.has('reports.view')) redirect('/');
  const sp = await searchParams;
  const ym = sp.month && isValidMonth(sp.month) ? sp.month : businessDate().slice(0, 7);
  const r = await reports(ym);
  const leaveSeg = r.leaveByType.map((l, i) => ({
    label: l.name,
    value: l.days,
    color: PALETTE[i % PALETTE.length],
  }));
  const leaveTotal = leaveSeg.reduce((s, x) => s + x.value, 0);
  const expenseTotal = r.expenses.reduce((s, x) => s + x.amount, 0);
  return (
    <Stack>
      <PageHead
        eyebrow="Leadership"
        title="Reports"
        lead="Attendance and expenses are for the month shown; leave is for the whole year."
        actions={<MonthNav ym={ym} label={fmtMonth(ym)} base="/leadership/reports" />}
      />
      <Two>
        <Card title="Headcount by department" icon={<Users />}>
          <Columns bars={r.headcount.map((h) => ({ label: h.dept, value: h.n }))} />
        </Card>
        <Card title={`Leave approved, ${ym.slice(0, 4)}`} sub="Working days by type" icon={<CalendarHeart />}>
          {leaveTotal ? (
            <div className="flex flex-wrap items-center justify-center gap-6">
              <Donut segments={leaveSeg} center={leaveTotal} sub="days" size={150} />
              <div className="grid gap-2">
                <Legend items={leaveSeg} values />
                <p className="text-xs text-muted">
                  {r.leaveByType.reduce((s, l) => s + l.requests, 0)} approved requests
                </p>
              </div>
            </div>
          ) : (
            <Empty>No approved leave yet this year.</Empty>
          )}
        </Card>
      </Two>
      <Card
        title={`Attendance by department, ${fmtMonth(ym)}`}
        sub="Share of expected working days present (excluding approved leave, up to yesterday)"
        icon={<ClipboardList />}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <BarList
            color="var(--c2)"
            rows={r.attendance
              .filter((a) => a.rate !== null)
              .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
              .map((a) => ({
                label: a.dept,
                value: a.rate ?? 0,
                display: `${a.rate}%`,
                hint: `${a.late} late`,
              }))}
          />
          <Table
            rows={r.attendance.length}
            head={['Department', '#Expected', '#Present', '#Late', '#Absent']}
          >
            {r.attendance.map((a) => (
              <tr key={a.dept}>
                <td className="font-medium">{a.dept}</td>
                <td className="num">{a.expected}</td>
                <td className="num">{a.present}</td>
                <td className="num">{a.late}</td>
                <td className="num">{a.absent}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
      <Card
        title={`Expenses by category, ${fmtMonth(ym)}`}
        sub={`${formatINR(expenseTotal, { decimals: false })} claimed`}
        icon={<ReceiptText />}
      >
        {r.expenses.length ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <BarList
              rows={r.expenses.map((x) => ({
                label: x.category,
                value: x.amount,
                display: formatINR(x.amount, { decimals: false }),
                hint: `${x.count}`,
              }))}
            />
            <Table rows={r.expenses.length} head={['Category', '#Claims', '#Claimed', '#Reimbursed']}>
              {r.expenses.map((x) => (
                <tr key={x.category}>
                  <td className="font-medium">{x.category}</td>
                  <td className="num">{x.count}</td>
                  <td className="num">{formatINR(x.amount)}</td>
                  <td className="num">{formatINR(x.reimbursed)}</td>
                </tr>
              ))}
            </Table>
          </div>
        ) : (
          <Empty icon={<BarChart3 />}>No claims this month.</Empty>
        )}
      </Card>
    </Stack>
  );
}
