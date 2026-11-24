import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { decideAction } from '@/server/actions/requests';
import { leaveTypeAction } from '@/server/actions/company';
import { canDecide } from '@/server/rbac';
import { fmtDate, fromDbDate } from '@/lib/dates';
import { ActionForm, DecideButtons, Submit } from '@/components/forms';
import { Card, PageHead, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'Leave' };

export default async function HrLeave({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('leave.all')) redirect('/');
  const sp = await searchParams;
  const status = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(sp.status ?? '')
    ? (sp.status as 'PENDING')
    : undefined;
  const [requests, types] = await Promise.all([
    db.leaveRequest.findMany({
      where: { ...(status ? { status } : {}), ...(sp.type ? { type: sp.type } : {}) },
      include: { employee: true, approver: true, leaveType: true },
      orderBy: { from: 'desc' },
      take: 300,
    }),
    db.leaveType.findMany({ orderBy: { code: 'asc' } }),
  ]);
  return (
    <Stack>
      <PageHead title="Leave" lead="All leave requests across the company." />
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          Status
          <select name="status" defaultValue={sp.status ?? ''}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label className="field">
          Type
          <select name="type" defaultValue={sp.type ?? ''}>
            <option value="">All</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
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
          rows={requests.length}
          head={['ID', 'Person', 'Type', 'Dates', '#Days', 'Reason', 'Status', '']}
          empty="No requests."
        >
          {requests.map((l) => (
            <tr key={l.id}>
              <td className="font-mono text-[13px]">{l.code}</td>
              <td>{l.employee.name}</td>
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
                {l.approver && !l.comment ? (
                  <div className="text-[13px] text-muted">by {l.approver.name}</div>
                ) : null}
              </td>
              <td>
                {l.status === 'PENDING' && canDecide(user, l.employee) ? (
                  <DecideButtons action={decideAction} kind="leave" id={l.id} />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {user.permissions.has('leave.policy') ? (
        <Card title="Leave types and entitlements">
          <Table rows={types.length} head={['Code', 'Name', '#Days a year', '#Carry forward', 'Active', '']}>
            {types.map((t) => (
              <tr key={t.code}>
                <td colSpan={6} className="!p-0">
                  <ActionForm
                    action={leaveTypeAction}
                    reset={false}
                    className="grid grid-cols-[70px_1fr_110px_120px_80px_auto] items-center gap-2 px-2.5 py-2"
                  >
                    <input type="hidden" name="code" value={t.code} />
                    <span className="font-mono">{t.code}</span>
                    <input name="name" defaultValue={t.name} aria-label="Name" />
                    <input
                      name="annualDays"
                      type="number"
                      min={0}
                      max={60}
                      defaultValue={t.annualDays}
                      aria-label="Days a year"
                    />
                    <input
                      name="carryForward"
                      type="number"
                      min={0}
                      max={60}
                      defaultValue={t.carryForward}
                      aria-label="Carry forward"
                    />
                    <select name="active" defaultValue={t.active ? 'on' : 'off'} aria-label="Active">
                      <option value="on">Yes</option>
                      <option value="off">No</option>
                    </select>
                    <Submit className="btn btn-sm">Save</Submit>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </Table>
          <h3 className="mt-4 mb-2 text-[13px] tracking-wider text-muted uppercase">Add a leave type</h3>
          <ActionForm
            action={leaveTypeAction}
            className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] items-end gap-3"
          >
            <label className="field">
              Code
              <input name="code" required maxLength={4} placeholder="ML" />
            </label>
            <label className="field">
              Name
              <input name="name" required placeholder="Maternity leave" />
            </label>
            <label className="field">
              Days a year
              <input name="annualDays" type="number" min={0} max={60} required />
            </label>
            <label className="field">
              Carry forward
              <input name="carryForward" type="number" min={0} max={60} defaultValue={0} />
            </label>
            <div>
              <Submit>Add type</Submit>
            </div>
          </ActionForm>
          <p className="mt-2 text-[13px] text-muted">
            On 1 January each person’s unused days carry forward, capped at the carry-forward limit, and the
            new year’s days are added.
          </p>
        </Card>
      ) : null}
    </Stack>
  );
}
