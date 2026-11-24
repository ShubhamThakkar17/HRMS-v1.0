import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { EXPENSE_CATEGORIES } from '@/server/services/expenses';
import { submitExpenseAction } from '@/server/actions/requests';
import { businessDate, fmtDate, fromDbDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { ActionForm, Submit } from '@/components/forms';
import { Card, Kpi, Kpis, PageHead, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'My expenses' };

export default async function MyExpenses() {
  const user = await requireUser();
  const claims = await db.expenseClaim.findMany({
    where: { employeeId: user.id },
    orderBy: { date: 'desc' },
    include: { approver: true, paidBy: true },
  });
  const sum = (s: string) =>
    claims.filter((c) => c.status === s).reduce((t, c) => t + Number(c.amountPaise), 0);
  const today = businessDate();
  return (
    <Stack>
      <PageHead
        title="My expenses"
        lead="Claims go to your manager, then Finance reimburses them in the next pay cycle."
      />
      <Kpis>
        <Kpi label="Waiting for manager" value={formatINR(sum('PENDING'))} />
        <Kpi label="Approved, to be paid" value={formatINR(sum('APPROVED'))} />
        <Kpi label="Reimbursed" value={formatINR(sum('REIMBURSED'))} />
      </Kpis>
      <Card title="New claim">
        <ActionForm
          action={submitExpenseAction}
          className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3.5"
        >
          <label className="field">
            Date
            <input type="date" name="date" max={today} defaultValue={today} required />
          </label>
          <label className="field">
            Category
            <select name="category" required>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Amount (₹)
            <input name="amount" inputMode="decimal" placeholder="1850.00" required />
          </label>
          <label className="field">
            Receipt (image or PDF, up to 10 MB)
            <input
              type="file"
              name="receipt"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              capture="environment"
            />
          </label>
          <label className="field col-span-full">
            Details
            <input name="note" required minLength={3} maxLength={500} placeholder="What was it for?" />
          </label>
          <div>
            <Submit pendingText="Uploading…">Submit claim</Submit>
          </div>
        </ActionForm>
      </Card>
      <Card title="My claims">
        <Table
          rows={claims.length}
          head={['ID', 'Date', 'Category', '#Amount', 'Details', 'Receipt', 'Status']}
          empty="No claims yet."
        >
          {claims.map((c) => (
            <tr key={c.id}>
              <td className="font-mono text-[13px]">{c.code}</td>
              <td className="whitespace-nowrap">{fmtDate(fromDbDate(c.date))}</td>
              <td>{c.category}</td>
              <td className="num">{formatINR(c.amountPaise)}</td>
              <td>
                {c.note}
                {c.comment ? (
                  <div className="text-[13px] text-muted">
                    {c.approver?.name}: {c.comment}
                  </div>
                ) : null}
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
                {c.paidBy ? <div className="text-[13px] text-muted">by {c.paidBy.name}</div> : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
