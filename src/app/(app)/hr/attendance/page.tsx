import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceMonth, statusOn } from '@/server/services/attendance';
import { hrCorrectAction } from '@/server/actions/employees';
import { businessDate, fmtDate, fmtMonth, isISODate, isValidMonth, istTime } from '@/lib/dates';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { AttendanceTable, summarise } from '@/components/attendance-table';
import { ActionForm, Submit } from '@/components/forms';
import { Card, DayPill, Kpi, Kpis, MonthNav, PageHead, Pill, Stack, Table } from '@/components/ui';

export const metadata = { title: 'Attendance' };

export default async function HrAttendance({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dept?: string; employee?: string; month?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('att.all')) redirect('/');
  const sp = await searchParams;
  const today = businessDate();
  const date = sp.date && isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const [emps, offices] = await Promise.all([
    db.employee.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
    db.office.findMany(),
  ]);
  const officeNames = new Map(offices.map((o) => [o.id, o.name.split(',')[0]!]));
  const depts = [...new Set(emps.map((e) => e.dept))].sort();
  const canCorrect = user.permissions.has('att.correct');

  // One person's month.
  if (sp.employee) {
    const e =
      emps.find((x) => x.id === sp.employee) ??
      (await db.employee.findUnique({ where: { id: sp.employee } }));
    if (!e) redirect('/hr/attendance');
    const ym = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);
    const days = await attendanceMonth(e.id, ym);
    const s = summarise(days);
    return (
      <Stack>
        <PageHead
          title={`${e.name} · attendance`}
          lead={`${e.code} · ${e.title}`}
          actions={
            <>
              <MonthNav ym={ym} label={fmtMonth(ym)} base="/hr/attendance" extra={`&employee=${e.id}`} />
              <a className="btn btn-ghost" href="/hr/attendance">
                All people
              </a>
            </>
          }
        />
        <Kpis>
          <Kpi label="Present" value={s.present} sub={`${s.late} late, ${s.short} short`} />
          <Kpi label="Absent" value={s.absent} />
          <Kpi label="On leave" value={s.leave} />
          <Kpi label="Hours" value={s.hours} />
        </Kpis>
        <Card>
          <AttendanceTable days={days} offices={officeNames} showFace />
        </Card>
        {canCorrect ? <CorrectionCard employees={[e]} date={today} /> : null}
      </Stack>
    );
  }

  const list = emps.filter((e) => !sp.dept || e.dept === sp.dept);
  const status = await statusOn(
    list.map((e) => e.id),
    date,
  );
  const counts = { in: 0, late: 0, absent: 0, leave: 0, remote: 0, flagged: 0 };
  for (const s of status.values()) {
    if (s.row?.firstIn) counts.in++;
    if (s.status === 'LATE') counts.late++;
    if (s.status === 'ABSENT') counts.absent++;
    if (s.status === 'LEAVE') counts.leave++;
    if (s.row?.remote) counts.remote++;
    if (s.row?.flagged) counts.flagged++;
  }
  return (
    <Stack>
      <PageHead
        title="Attendance"
        lead={`Everyone’s attendance for ${fmtDate(date)}.${canCorrect ? ' Corrections need a reason and are logged.' : ''}`}
      />
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          Date
          <input type="date" name="date" defaultValue={date} max={today} />
        </label>
        <label className="field">
          Department
          <select name="dept" defaultValue={sp.dept ?? ''}>
            <option value="">All departments</option>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Show
        </button>
      </form>
      <Kpis>
        <Kpi label="Checked in" value={`${counts.in} of ${list.length}`} sub={`${counts.remote} remote`} />
        <Kpi label="Late" value={counts.late} />
        <Kpi
          label={date === today ? 'Not in yet / absent' : 'Absent'}
          value={date === today ? list.length - counts.in - counts.leave : counts.absent}
        />
        <Kpi label="On leave" value={counts.leave} />
        <Kpi label="Outside office" value={counts.flagged} tone={counts.flagged ? 'warn' : undefined} />
      </Kpis>
      <Card>
        <Table
          rows={list.length}
          head={['ID', 'Person', 'Department', 'Status', 'In', 'Out', '#Hours', 'Method', 'Where', '']}
        >
          {list.map((e) => {
            const s = status.get(e.id);
            const r = s?.row;
            return (
              <tr key={e.id}>
                <td className="font-mono text-[13px]">{e.code}</td>
                <td>{e.name}</td>
                <td>{e.dept}</td>
                <td>{s ? <DayPill status={s.status} /> : null}</td>
                <td className="font-mono">{r?.firstIn ? istTime(r.firstIn) : ''}</td>
                <td className="font-mono">{r?.lastOut ? istTime(r.lastOut) : ''}</td>
                <td className="num">{r?.hours ?? ''}</td>
                <td>{r?.inMethod ? METHOD_LABEL[r.inMethod] : ''}</td>
                <td>
                  {r?.firstIn ? (
                    r.officeId ? (
                      officeNames.get(r.officeId)
                    ) : r.flagged ? (
                      <Pill tone="bad">Outside office</Pill>
                    ) : r.remote ? (
                      'Remote'
                    ) : (
                      '—'
                    )
                  ) : (
                    ''
                  )}
                </td>
                <td>
                  <a href={`/hr/attendance?employee=${e.id}`}>Month</a>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {canCorrect ? <CorrectionCard employees={list} date={date} /> : null}
    </Stack>
  );
}

function CorrectionCard({
  employees,
  date,
}: {
  employees: { id: string; name: string; code: string }[];
  date: string;
}) {
  return (
    <Card title="HR correction">
      <ActionForm
        action={hrCorrectAction}
        className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3.5"
      >
        <label className="field">
          Person
          <select name="employeeId" required>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.code})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Date
          <input type="date" name="date" defaultValue={date} max={businessDate()} required />
        </label>
        <label className="field">
          Check-in
          <input type="time" name="inTime" defaultValue="09:30" required />
        </label>
        <label className="field">
          Check-out (optional)
          <input type="time" name="outTime" defaultValue="18:30" />
        </label>
        <label className="field col-span-full">
          Reason (required, kept in the audit log)
          <input name="reason" required minLength={3} />
        </label>
        <div>
          <Submit>Save correction</Submit>
        </div>
      </ActionForm>
      <p className="mt-2 text-[13px] text-muted">
        This replaces that day’s punches with an HR punch pair and rebuilds the day’s status.
      </p>
    </Card>
  );
}
