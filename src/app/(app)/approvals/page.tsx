import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { approvalsInbox } from '@/server/services/approvals';
import { decideAction, reimburseAction } from '@/server/actions/requests';
import { canSeeApprovals } from '@/lib/permissions';
import { fmtDate, fromDbDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { ActionButton, DecideButtons } from '@/components/forms';
import { Card, PageHead, Stack, Table } from '@/components/ui';

export const metadata = { title: 'Approvals' };

export default async function Approvals() {
  const user = await requireUser();
  if (!canSeeApprovals(user.permissions)) redirect('/');
  const inbox = await approvalsInbox(user);
  const scope = user.permissions.has('leave.approve_all') ? 'everyone' : 'your direct reports';
  return (
    <Stack>
      <PageHead
        title="Approvals"
        lead={`Leave, attendance corrections and expense claims from ${scope}. You never approve your own requests.`}
      />
      {(user.permissions.has('approve.team') || user.permissions.has('leave.approve_all')) && (
        <>
          <Card title={`Leave requests (${inbox.leaves.length})`}>
            <Table
              rows={inbox.leaves.length}
              head={['ID', 'Person', 'Type', 'Dates', '#Days', 'Reason', '']}
              empty="No leave waiting."
            >
              {inbox.leaves.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono text-[13px]">{l.code}</td>
                  <td>
                    {l.employee.name}
                    <div className="text-[13px] text-muted">{l.employee.dept}</div>
                  </td>
                  <td>{l.type}</td>
                  <td className="whitespace-nowrap">
                    {fmtDate(fromDbDate(l.from))}
                    {l.from.getTime() !== l.to.getTime() ? ` to ${fmtDate(fromDbDate(l.to))}` : ''}
                  </td>
                  <td className="num">{l.days}</td>
                  <td>{l.reason}</td>
                  <td>
                    <DecideButtons action={decideAction} kind="leave" id={l.id} />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title={`Attendance corrections (${inbox.regs.length})`}>
            <Table
              rows={inbox.regs.length}
              head={['ID', 'Person', 'Date', 'In', 'Out', 'Reason', '']}
              empty="No corrections waiting."
            >
              {inbox.regs.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-[13px]">{r.code}</td>
                  <td>{r.employee.name}</td>
                  <td className="whitespace-nowrap">{fmtDate(fromDbDate(r.date))}</td>
                  <td className="font-mono">{r.inTime}</td>
                  <td className="font-mono">{r.outTime}</td>
                  <td>{r.reason}</td>
                  <td>
                    <DecideButtons action={decideAction} kind="reg" id={r.id} />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title={`Expense claims (${inbox.expenses.length})`}>
            <Table
              rows={inbox.expenses.length}
              head={['ID', 'Person', 'Date', 'Category', '#Amount', 'Details', '']}
              empty="No claims waiting."
            >
              {inbox.expenses.map((x) => (
                <tr key={x.id}>
                  <td className="font-mono text-[13px]">{x.code}</td>
                  <td>{x.employee.name}</td>
                  <td className="whitespace-nowrap">{fmtDate(fromDbDate(x.date))}</td>
                  <td>{x.category}</td>
                  <td className="num">{formatINR(x.amountPaise)}</td>
                  <td>
                    {x.note}
                    {x.receiptKey ? (
                      <div>
                        <a href={`/api/receipts/${x.id}`} target="_blank" rel="noopener">
                          View receipt
                        </a>
                      </div>
                    ) : (
                      <div className="text-[13px] text-muted">No receipt</div>
                    )}
                  </td>
                  <td>
                    <DecideButtons action={decideAction} kind="expense" id={x.id} />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
      {user.permissions.has('expense.pay') && (
        <Card title={`Approved claims to reimburse (${inbox.toPay.length})`}>
          <Table
            rows={inbox.toPay.length}
            head={['ID', 'Person', 'Date', 'Category', '#Amount', 'Details', '']}
            empty="Nothing to reimburse."
          >
            {inbox.toPay.map((x) => (
              <tr key={x.id}>
                <td className="font-mono text-[13px]">{x.code}</td>
                <td>{x.employee.name}</td>
                <td className="whitespace-nowrap">{fmtDate(fromDbDate(x.date))}</td>
                <td>{x.category}</td>
                <td className="num">{formatINR(x.amountPaise)}</td>
                <td>
                  {x.note}
                  {x.receiptKey ? (
                    <div>
                      <a href={`/api/receipts/${x.id}`} target="_blank" rel="noopener">
                        View receipt
                      </a>
                    </div>
                  ) : null}
                </td>
                <td>
                  <ActionButton action={reimburseAction} fields={{ id: x.id }} label="Mark reimbursed" />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </Stack>
  );
}
