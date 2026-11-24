import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { reports } from '@/server/services/reports';
import { businessDate, fmtMonth, isValidMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { Bars, Card, MonthNav, PageHead, Stack, Table, Two } from '@/components/ui';

export const metadata = { title: 'Reports' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  if (!user.permissions.has('reports.view')) redirect('/');
  const sp = await searchParams;
  const ym = sp.month && isValidMonth(sp.month) ? sp.month : businessDate().slice(0, 7);
  const r = await reports(ym);
  return (
    <Stack>
      <PageHead
        title="Reports"
        lead="Attendance and expenses are for the month shown; leave is for the whole year."
        actions={<MonthNav ym={ym} label={fmtMonth(ym)} base="/leadership/reports" />}
      />
      <Two>
        <Card title="Headcount by department">
          <Bars rows={r.headcount.map((h) => ({ label: h.dept, value: h.n, display: String(h.n) }))} />
        </Card>
        <Card title={`Leave approved by type, ${ym.slice(0, 4)}`}>
          <Table rows={r.leaveByType.length} head={['Type', '#Requests', '#Days']}>
            {r.leaveByType.map((l) => (
              <tr key={l.code}>
                <td>{l.name}</td>
                <td className="num">{l.requests}</td>
                <td className="num">{l.days}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </Two>
      <Card title={`Attendance by department, ${fmtMonth(ym)}`}>
        <Table
          rows={r.attendance.length}
          head={['Department', '#Expected days', '#Present', '#Late days', '#Absent', '#Attendance rate']}
        >
          {r.attendance.map((a) => (
            <tr key={a.dept}>
              <td>{a.dept}</td>
              <td className="num">{a.expected}</td>
              <td className="num">{a.present}</td>
              <td className="num">{a.late}</td>
              <td className="num">{a.absent}</td>
              <td className="num">{a.rate === null ? '—' : `${a.rate}%`}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[13px] text-muted">
          Expected days are working days since joining, excluding approved leave, up to yesterday.
        </p>
      </Card>
      <Card title={`Expenses by category, ${fmtMonth(ym)}`}>
        <Table
          rows={r.expenses.length}
          head={['Category', '#Claims', '#Claimed', '#Reimbursed']}
          empty="No claims this month."
        >
          {r.expenses.map((x) => (
            <tr key={x.category}>
              <td>{x.category}</td>
              <td className="num">{x.count}</td>
              <td className="num">{formatINR(x.amount)}</td>
              <td className="num">{formatINR(x.reimbursed)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
