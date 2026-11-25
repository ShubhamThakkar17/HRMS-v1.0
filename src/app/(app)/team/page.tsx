import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarHeart, ClipboardCheck, MapPinOff, Users } from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { statusOn } from '@/server/services/attendance';
import { addDays, businessDate, fmtDate, fmtShort, fromDbDate, istTime, toDbDate } from '@/lib/dates';
import { fmtDistance } from '@/lib/geo';
import { METHOD_LABEL, STATUS_LABEL } from '@/lib/attendance-rules';
import { Avatar, Card, DayPill, Empty, PageHead, Stack, StatusPill, Two } from '@/components/ui';
import { Donut, Legend } from '@/components/charts';

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
      take: 20,
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
  const count = (f: (s: (typeof vals)[number]) => boolean) => vals.filter(f).length;
  const seg = [
    { label: 'In', value: count((s) => !!s.row?.firstIn && !s.row?.remote), color: 'var(--good)' },
    { label: 'Remote', value: count((s) => !!s.row?.remote), color: 'var(--c2)' },
    { label: 'On leave', value: count((s) => s.status === 'LEAVE'), color: 'var(--c4)' },
    {
      label: 'Not in',
      value: count(
        (s) => !s.row?.firstIn && s.status !== 'LEAVE' && s.status !== 'WEEKEND' && s.status !== 'HOLIDAY',
      ),
      color: 'var(--c6)',
    },
  ];
  const waiting = pending[0] + pending[1] + pending[2];
  return (
    <Stack>
      <PageHead
        eyebrow="Team"
        title="Team overview"
        lead={`${team.length} direct report(s) · ${fmtDate(today)}`}
        actions={
          <>
            {waiting ? (
              <Link className="btn" href="/approvals">
                <ClipboardCheck className="size-4" /> {waiting} to approve
              </Link>
            ) : null}
            <Link className="btn btn-ghost" href="/team/attendance">
              Month view
            </Link>
          </>
        }
      />
      {team.length ? (
        <>
          <Two wide>
            <Card title="Today" icon={<Users />}>
              <div className="grid gap-3 sm:grid-cols-2">
                {team.map((t) => {
                  const s = status.get(t.id);
                  const r = s?.row;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2"
                    >
                      <Avatar name={t.name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{t.name}</div>
                        <div className="truncate text-xs text-muted">
                          {r?.firstIn
                            ? `In ${istTime(r.firstIn)} · ${METHOD_LABEL[r.inMethod ?? ''] ?? ''}${r.lastOut ? ` · out ${istTime(r.lastOut)}` : ''}`
                            : t.title}
                        </div>
                      </div>
                      {s ? (
                        <DayPill
                          status={s.status}
                          label={r?.flagged ? 'Outside' : r?.remote ? 'Remote' : STATUS_LABEL[s.status]}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Right now">
              <div className="grid justify-items-center gap-4">
                <Donut
                  segments={seg}
                  center={`${seg[0]!.value + seg[1]!.value}/${team.length}`}
                  sub="checked in"
                  size={150}
                />
                <Legend items={seg} values />
              </div>
            </Card>
          </Two>
          <Two>
            <Card title="Outside the work area" sub="Last 14 days" icon={<MapPinOff />}>
              {flagged.length ? (
                <ul className="grid gap-2">
                  {flagged.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-bad-bg/50 px-3 py-2 text-sm"
                    >
                      <span>
                        <b>{p.employee.name}</b> · {fmtShort(fromDbDate(p.businessDate))} {istTime(p.at)} ·{' '}
                        {p.direction === 'IN' ? 'in' : 'out'}
                      </span>
                      <span className="chip shrink-0 bg-white text-bad">{fmtDistance(p.distanceM)} away</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No punches outside the work area.</Empty>
              )}
            </Card>
            <Card title="Leave in the next 14 days" icon={<CalendarHeart />}>
              {onLeaveSoon.length ? (
                <ul className="grid gap-2.5">
                  {onLeaveSoon.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={l.employee.name} size={28} />
                        <span className="truncate">
                          <b>{l.employee.name.split(' ')[0]}</b> · {l.type} · {fmtShort(fromDbDate(l.from))}
                          {l.to.getTime() !== l.from.getTime() ? ` – ${fmtShort(fromDbDate(l.to))}` : ''}
                        </span>
                      </span>
                      <StatusPill status={l.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No leave coming up.</Empty>
              )}
            </Card>
          </Two>
        </>
      ) : (
        <div className="card">
          <Empty icon={<Users />}>No one reports to you yet.</Empty>
        </div>
      )}
    </Stack>
  );
}
