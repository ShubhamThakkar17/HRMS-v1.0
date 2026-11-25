import { CalendarDays, ClipboardEdit, History, PieChart } from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceMonth } from '@/server/services/attendance';
import { applyRegAction, cancelRegAction } from '@/server/actions/requests';
import { businessDate, fmtDate, fmtMonth, fromDbDate, isValidMonth } from '@/lib/dates';
import { AttendanceTable, summarise } from '@/components/attendance-table';
import { MonthCalendar } from '@/components/month-calendar';
import { Donut, Legend } from '@/components/charts';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { Card, Empty, MonthNav, PageHead, Stack, StatusPill, Table, Two } from '@/components/ui';

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
  const seg = [
    { label: 'Present', value: s.present, color: 'var(--good)' },
    { label: 'Late / short', value: s.late + s.short, color: 'var(--c3)' },
    { label: 'Absent', value: s.absent, color: 'var(--bad)' },
    { label: 'Leave', value: s.leave, color: 'var(--c4)' },
  ];
  const worked = s.present + s.late + s.short;
  return (
    <Stack>
      <PageHead
        title="My attendance"
        lead="Each day’s status at a glance. Ask for a correction if a day is wrong."
        actions={<MonthNav ym={ym} label={fmtMonth(ym)} base="/my/attendance" />}
      />
      <Two wide>
        <Card title={fmtMonth(ym)} icon={<CalendarDays />}>
          <MonthCalendar days={days} />
        </Card>
        <Card title="Summary" icon={<PieChart />}>
          <div className="grid justify-items-center gap-4">
            <Donut segments={seg} center={worked} sub="days worked" size={160} />
            <Legend items={seg} values />
            <div className="grid w-full grid-cols-2 gap-3 border-t border-line pt-4 text-center">
              <div>
                <div className="text-xl font-semibold">{s.hours}</div>
                <div className="text-xs text-muted">hours worked</div>
              </div>
              <div>
                <div className="text-xl font-semibold">
                  {worked ? Math.round((s.hours / worked) * 10) / 10 : 0}
                </div>
                <div className="text-xs text-muted">hours per day</div>
              </div>
            </div>
          </div>
        </Card>
      </Two>
      <Card
        title="Ask for a correction"
        icon={<ClipboardEdit />}
        sub="For an absent day or a missing check-out. Your manager approves it."
      >
        {fixable.length ? (
          <ActionForm
            action={applyRegAction}
            className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]"
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
        ) : (
          <Empty>No absent days or missing check-outs this month.</Empty>
        )}
      </Card>
      {regs.length ? (
        <Card title="My corrections" icon={<History />}>
          <Table rows={regs.length} head={['ID', 'Date', 'Time', 'Reason', 'Status', '']}>
            {regs.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-[13px]">{r.code}</td>
                <td className="whitespace-nowrap">{fmtDate(fromDbDate(r.date))}</td>
                <td className="font-mono whitespace-nowrap">
                  {r.inTime}–{r.outTime}
                </td>
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
      ) : null}
      <details className="card group">
        <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden">
          Day-by-day details{' '}
          <span className="ml-1 text-sm font-normal text-muted group-open:hidden">(show)</span>
        </summary>
        <div className="mt-4">
          <AttendanceTable days={days} offices={officeNames} />
        </div>
      </details>
    </Stack>
  );
}
