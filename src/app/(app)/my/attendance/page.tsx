import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceMonth } from '@/server/services/attendance';
import { applyRegAction, cancelRegAction } from '@/server/actions/requests';
import { businessDate, fmtDate, fmtMonth, fromDbDate, isValidMonth } from '@/lib/dates';
import { AttendanceTable, summarise } from '@/components/attendance-table';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { Card, Kpi, Kpis, MonthNav, PageHead, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'My attendance' };

export default async function MyAttendance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = businessDate();
  const ym = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);
  const [days, offices, regs] = await Promise.all([
    attendanceMonth(user.id, ym),
    db.office.findMany(),
    db.regularisation.findMany({
      where: { employeeId: user.id },
      orderBy: { date: 'desc' },
      take: 20,
      include: { approver: true },
    }),
  ]);
  const officeNames = new Map(offices.map((o) => [o.id, o.name.split(',')[0]!]));
  const s = summarise(days);
  const fixable = days.filter(
    (d) => d.date <= today && (d.status === 'ABSENT' || (d.firstIn && !d.lastOut && d.date < today)),
  );
  return (
    <Stack>
      <PageHead
        title="My attendance"
        lead="Every punch with its method and location. Ask for a correction if a day is wrong."
        actions={<MonthNav ym={ym} label={fmtMonth(ym)} base="/my/attendance" />}
      />
      <Kpis>
        <Kpi label="Present" value={s.present} sub={`${s.late} late, ${s.short} short`} />
        <Kpi label="Absent" value={s.absent} tone={s.absent ? 'warn' : undefined} />
        <Kpi label="On leave" value={s.leave} />
        <Kpi label="Hours worked" value={s.hours} />
      </Kpis>
      <Card title={fmtMonth(ym)}>
        <AttendanceTable days={days} offices={officeNames} />
      </Card>
      <Card title="Ask for a correction">
        <ActionForm
          action={applyRegAction}
          className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3.5"
        >
          <label className="field">
            Date
            <select name="date" required defaultValue="">
              <option value="" disabled>
                Choose a day
              </option>
              {fixable.map((d) => (
                <option key={d.date} value={d.date}>
                  {fmtDate(d.date)} · {d.status === 'ABSENT' ? 'absent' : 'no check-out'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Check-in
            <input name="inTime" type="time" defaultValue="09:30" required />
          </label>
          <label className="field">
            Check-out
            <input name="outTime" type="time" defaultValue="18:30" required />
          </label>
          <label className="field col-span-full">
            Reason
            <input
              name="reason"
              required
              minLength={3}
              placeholder="For example: at a client site, forgot to punch out"
            />
          </label>
          <div>
            <Submit>Send to manager</Submit>
          </div>
        </ActionForm>
        {!fixable.length ? (
          <p className="mt-2 text-[13px] text-muted">No absent days or missing check-outs this month.</p>
        ) : null}
      </Card>
      <Card title="My corrections">
        <Table
          rows={regs.length}
          head={['ID', 'Date', 'In', 'Out', 'Reason', 'Status', '']}
          empty="No corrections yet."
        >
          {regs.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[13px]">{r.code}</td>
              <td className="whitespace-nowrap">{fmtDate(fromDbDate(r.date))}</td>
              <td className="font-mono">{r.inTime}</td>
              <td className="font-mono">{r.outTime}</td>
              <td>
                {r.reason}
                {r.comment ? (
                  <div className="text-[13px] text-muted">
                    {r.approver?.name}: {r.comment}
                  </div>
                ) : null}
              </td>
              <td>
                <StatusPill status={r.status} />
              </td>
              <td>
                {r.status === 'PENDING' ? (
                  <ActionButton
                    action={cancelRegAction}
                    fields={{ id: r.id }}
                    label="Cancel"
                    className="btn btn-sm btn-ghost"
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
