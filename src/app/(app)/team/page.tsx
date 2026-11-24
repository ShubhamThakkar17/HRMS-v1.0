import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { statusOn } from '@/server/services/attendance';
import { addDays, businessDate, fmtDate, fromDbDate, istTime, toDbDate } from '@/lib/dates';
import { fmtDistance } from '@/lib/geo';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { Card, DayPill, Kpi, Kpis, PageHead, Pill, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'Team overview' };

export default async function Team() {
  const user = await requireUser();
  if (!user.permissions.has('team.view')) redirect('/');
  const today = businessDate();
  const team = await db.employee.findMany({
    where: { managerId: user.id, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: { office: true },
  });
  const ids = team.map((t) => t.id);
  const [status, flagged, pending, onLeaveSoon] = await Promise.all([
    statusOn(ids, today),
    db.punch.findMany({
      where: {
        employeeId: { in: ids },
        flag: 'OUTSIDE_GEOFENCE',
        businessDate: { gte: toDbDate(addDays(today, -14)) },
      },
      include: { employee: true },
      orderBy: { at: 'desc' },
    }),
    Promise.all([
      db.leaveRequest.count({ where: { employeeId: { in: ids }, status: 'PENDING' } }),
      db.regularisation.count({ where: { employeeId: { in: ids }, status: 'PENDING' } }),
      db.expenseClaim.count({ where: { employeeId: { in: ids }, status: 'PENDING' } }),
    ]),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: { in: ['APPROVED', 'PENDING'] },
        to: { gte: toDbDate(today) },
        from: { lte: toDbDate(addDays(today, 14)) },
      },
      include: { employee: true },
      orderBy: { from: 'asc' },
    }),
  ]);
  const vals = [...status.values()];
  const inNow = vals.filter((s) => s.row?.firstIn).length;
  const remote = vals.filter((s) => s.row?.remote).length;
  const away = vals.filter((s) => s.status === 'LEAVE').length;
  return (
    <Stack>
      <PageHead
        title="Team overview"
        lead={`${team.length} direct report(s) · ${fmtDate(today)}`}
        actions={
          <Link className="btn btn-ghost" href="/team/attendance">
            Team attendance
          </Link>
        }
      />
      <Kpis>
        <Kpi label="In today" value={`${inNow} of ${team.length}`} sub={`${remote} remote`} />
        <Kpi label="On leave today" value={away} />
        <Kpi
          label="Waiting for you"
          value={pending[0] + pending[1] + pending[2]}
          sub={`${pending[0]} leave · ${pending[1]} corrections · ${pending[2]} claims`}
          tone={pending[0] + pending[1] + pending[2] ? 'warn' : undefined}
        />
        <Kpi
          label="Outside-office punches"
          value={flagged.length}
          sub="last 14 days"
          tone={flagged.length ? 'warn' : undefined}
        />
      </Kpis>
      <Card title="Today">
        <Table
          rows={team.length}
          head={['Person', 'Status', 'In', 'Out', 'Method', 'Where']}
          empty="No direct reports."
        >
          {team.map((t) => {
            const s = status.get(t.id);
            const r = s?.row;
            return (
              <tr key={t.id}>
                <td>
                  {t.name}
                  <div className="text-[13px] text-muted">{t.title}</div>
                </td>
                <td>{s ? <DayPill status={s.status} /> : null}</td>
                <td className="font-mono">{r?.firstIn ? istTime(r.firstIn) : ''}</td>
                <td className="font-mono">{r?.lastOut ? istTime(r.lastOut) : ''}</td>
                <td>{r?.inMethod ? METHOD_LABEL[r.inMethod] : ''}</td>
                <td>
                  {r?.firstIn ? (
                    r.officeId ? (
                      'Office'
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
              </tr>
            );
          })}
        </Table>
      </Card>
      <Card title="Punches outside the office geofence">
        <Table
          rows={flagged.length}
          head={['Person', 'Date', 'Time', 'Direction', '#Distance', '#Accuracy']}
          empty="No flagged punches in the last 14 days."
        >
          {flagged.map((p) => (
            <tr key={p.id}>
              <td>{p.employee.name}</td>
              <td className="whitespace-nowrap">{fmtDate(fromDbDate(p.businessDate))}</td>
              <td className="font-mono">{istTime(p.at)}</td>
              <td>{p.direction === 'IN' ? 'Check in' : 'Check out'}</td>
              <td className="num">{fmtDistance(p.distanceM)}</td>
              <td className="num">{p.accuracyM != null ? `±${p.accuracyM} m` : ''}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Leave in the next 14 days">
        <Table
          rows={onLeaveSoon.length}
          head={['Person', 'Type', 'Dates', '#Days', 'Status']}
          empty="No leave coming up."
        >
          {onLeaveSoon.map((l) => (
            <tr key={l.id}>
              <td>{l.employee.name}</td>
              <td>{l.type}</td>
              <td className="whitespace-nowrap">
                {fmtDate(fromDbDate(l.from))}
                {l.to.getTime() !== l.from.getTime() ? ` to ${fmtDate(fromDbDate(l.to))}` : ''}
              </td>
              <td className="num">{l.days}</td>
              <td>
                <StatusPill status={l.status} />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
