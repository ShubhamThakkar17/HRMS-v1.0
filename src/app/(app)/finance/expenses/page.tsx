import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { reimburseAction } from '@/server/actions/requests';
import { fmtDate, fromDbDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { ActionButton } from '@/components/forms';
import { Card, Kpi, Kpis, PageHead, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'Expense claims' };

const STATUSES = ['PENDING', 'APPROVED', 'REIMBURSED', 'REJECTED'] as const;

export default async function FinanceExpenses({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('expense.pay')) redirect('/');
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const [claims, totals] = await Promise.all([
    db.expenseClaim.findMany({
      where: status ? { status } : {},
      include: { employee: true, approver: true, paidBy: true },
      orderBy: { date: 'desc' },
      take: 500,
    }),
    db.expenseClaim.groupBy({ by: ['status'], _sum: { amountPaise: true }, _count: true }),
  ]);
  const t = (s: string) => totals.find((x) => x.status === s);
  const qs = new URLSearchParams(status ? { status } : {}).toString();
  return (
    <Stack>
      <PageHead
        title="Expense claims"
        lead="Managers approve claims; Finance reimburses them."
        actions={
          <a className="btn btn-ghost" href={`/api/export/expenses${qs ? `?${qs}` : ''}`}>
            Export CSV
          </a>
        }
      />
      <Kpis>
        {STATUSES.map((s) => (
          <Kpi
            key={s}
            label={s.charAt(0) + s.slice(1).toLowerCase()}
            value={formatINR(t(s)?._sum.amountPaise ?? 0)}
            sub={`${t(s)?._count ?? 0} claim(s)`}
            tone={s === 'APPROVED' && t(s)?._count ? 'warn' : undefined}
          />
        ))}
      </Kpis>
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          Status
          <select name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>
      <Card>
        <Table
          rows={claims.length}
          head={['ID', 'Person', 'Date', 'Category', '#Amount', 'Details', 'Receipt', 'Status', '']}
          empty="No claims."
        >
          {claims.map((c) => (
            <tr key={c.id}>
              <td className="font-mono text-[13px]">{c.code}</td>
              <td>
                {c.employee.name}
                <div className="text-[13px] text-muted">{c.employee.dept}</div>
              </td>
              <td className="whitespace-nowrap">{fmtDate(fromDbDate(c.date))}</td>
              <td>{c.category}</td>
              <td className="num">{formatINR(c.amountPaise)}</td>
              <td>
                {c.note}
                {c.comment ? <div className="text-[13px] text-muted">{c.comment}</div> : null}
              </td>
              <td>
                {c.receiptKey ? (
                  <a href={`/api/receipts/${c.id}`} target="_blank" rel="noopener">
                    View
                  </a>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </td>
              <td>
                <StatusPill status={c.status} />
                {c.approver ? (
                  <div className="text-[13px] text-muted">
                    {c.status === 'REJECTED' ? 'rejected' : 'approved'} by {c.approver.name}
                  </div>
                ) : null}
                {c.paidBy ? <div className="text-[13px] text-muted">paid by {c.paidBy.name}</div> : null}
              </td>
              <td>
                {c.status === 'APPROVED' && c.employeeId !== user.id ? (
                  <ActionButton action={reimburseAction} fields={{ id: c.id }} label="Reimburse" />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
