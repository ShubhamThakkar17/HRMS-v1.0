import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { balancesFor } from '@/server/services/leave';
import { applyLeaveAction, cancelLeaveAction } from '@/server/actions/requests';
import { businessDate, fmtDate, fromDbDate } from '@/lib/dates';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { Card, Kpi, Kpis, PageHead, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'My leave' };

export default async function MyLeave() {
  const user = await requireUser();
  const [balances, requests] = await Promise.all([
    balancesFor(user.id),
    db.leaveRequest.findMany({
      where: { employeeId: user.id },
      orderBy: { from: 'desc' },
      include: { approver: true, leaveType: true },
    }),
  ]);
  const today = businessDate();
  return (
    <Stack>
      <PageHead
        title="My leave"
        lead="Working days only: weekends and holidays are not counted. Available days already subtract pending requests."
      />
      <Kpis>
        {balances.map((b) => (
          <Kpi
            key={b.code}
            label={b.name}
            value={`${b.available} available`}
            sub={`${b.remaining} left of ${b.opening + b.accrued}${b.opening ? ` (incl. ${b.opening} carried)` : ''} · ${b.used} used · ${b.pending} pending`}
          />
        ))}
      </Kpis>
      <Card title="Apply for leave">
        <ActionForm
          action={applyLeaveAction}
          className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3.5"
        >
          <label className="field">
            Type
            <select name="type" required>
              {balances.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name} ({b.available} available)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            From
            <input type="date" name="from" min={today} defaultValue={today} required />
          </label>
          <label className="field">
            To
            <input type="date" name="to" min={today} defaultValue={today} required />
          </label>
          <label className="field col-span-full">
            Reason
            <input name="reason" required minLength={3} maxLength={500} />
          </label>
          <div>
            <Submit>Send request</Submit>
          </div>
        </ActionForm>
      </Card>
      <Card title="My requests">
        <Table
          rows={requests.length}
          head={['ID', 'Type', 'Dates', '#Days', 'Reason', 'Status', '']}
          empty="No requests yet."
        >
          {requests.map((l) => (
            <tr key={l.id}>
              <td className="font-mono text-[13px]">{l.code}</td>
              <td>{l.leaveType.name}</td>
              <td className="whitespace-nowrap">
                {fmtDate(fromDbDate(l.from))}
                {l.to.getTime() !== l.from.getTime() ? ` to ${fmtDate(fromDbDate(l.to))}` : ''}
              </td>
              <td className="num">{l.days}</td>
              <td>
                {l.reason}
                {l.comment ? (
                  <div className="text-[13px] text-muted">
                    {l.approver?.name}: {l.comment}
                  </div>
                ) : null}
              </td>
              <td>
                <StatusPill status={l.status} />
              </td>
              <td>
                {l.status === 'PENDING' ? (
                  <ActionButton
                    action={cancelLeaveAction}
                    fields={{ id: l.id }}
                    label="Cancel"
                    className="btn btn-sm btn-ghost"
                    confirm="Cancel this request?"
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
