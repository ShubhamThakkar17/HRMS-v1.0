import Link from 'next/link';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceRange } from '@/server/services/attendance';
import { balancesFor } from '@/server/services/leave';
import { approvalsCount } from '@/server/services/approvals';
import { canSeeApprovals } from '@/lib/permissions';
import { businessDate, fmtDate, fmtShort, fromDbDate, istTime, toDbDate } from '@/lib/dates';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { Card, DayPill, Kpi, Kpis, Notice, PageHead, Stack, StatusPill, Two } from '@/components/ui';

export default async function Home() {
  const user = await requireUser();
  const today = businessDate();
  const [[day], balances, anns, upcoming, holidays, waiting] = await Promise.all([
    attendanceRange(user.id, today, today),
    balancesFor(user.id),
    db.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 3,
      include: { author: true },
    }),
    db.leaveRequest.findMany({
      where: { employeeId: user.id, to: { gte: toDbDate(today) }, status: { in: ['PENDING', 'APPROVED'] } },
      orderBy: { from: 'asc' },
    }),
    db.holiday.findMany({
      where: {
        date: { gte: toDbDate(today) },
        OR: [{ officeId: null }, { officeId: user.officeId ?? '__none__' }],
      },
      orderBy: { date: 'asc' },
      take: 3,
    }),
    canSeeApprovals(user.permissions) ? approvalsCount(user) : Promise.resolve(0),
  ]);
  const hour = Number(new Date(Date.now() + 330 * 60_000).toISOString().slice(11, 13));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const line = day?.firstIn
    ? `Checked in at ${istTime(day.firstIn)} by ${(METHOD_LABEL[day.inMethod ?? ''] ?? '').toLowerCase()}${day.lastOut ? `, out at ${istTime(day.lastOut)} (${day.hours} h)` : ''}`
    : 'You have not checked in yet.';

  return (
    <Stack>
      <PageHead
        title={`${greet}, ${user.name.split(' ')[0]}`}
        lead={`${fmtDate(today)} · ${user.title} · viewing as ${user.activeRole}`}
      />
      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-muted">Today</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            {day ? <DayPill status={day.status} label={day.holidayName} /> : null}
            <span>{line}</span>
          </div>
        </div>
        <Link className="btn btn-lg" href="/punch">
          {day?.firstIn && !day.lastOut ? 'Go to check out' : 'Go to punch'}
        </Link>
      </section>
      {waiting ? (
        <Notice>
          <strong>{waiting} item(s) wait for you.</strong>
          <Link className="btn btn-sm" href="/approvals">
            Open approvals
          </Link>
        </Notice>
      ) : null}
      <Kpis>
        {balances.map((b) => (
          <Kpi
            key={b.code}
            label={b.name}
            value={`${b.remaining} of ${b.opening + b.accrued}`}
            sub={b.pending ? `${b.pending} day(s) pending` : 'days left this year'}
          />
        ))}
      </Kpis>
      <Two>
        <Card
          title="Announcements"
          extra={
            <Link href="/announcements" className="text-sm">
              All
            </Link>
          }
        >
          {anns.length ? (
            anns.map((a) => (
              <article
                key={a.id}
                className="grid gap-1.5 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{a.title}</strong>
                  {a.pinned ? (
                    <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
                      Pinned
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-line">{a.body}</p>
                <p className="text-[13px] text-muted">
                  {a.author.name} · {fmtDate(businessDate(a.publishedAt))}
                </p>
              </article>
            ))
          ) : (
            <p className="text-muted">No announcements.</p>
          )}
        </Card>
        <Card title="Coming up">
          {upcoming.length ? (
            <ul className="grid gap-2">
              {upcoming.map((l) => (
                <li key={l.id}>
                  <StatusPill status={l.status} /> {l.type}, {fmtShort(fromDbDate(l.from))}
                  {l.to.getTime() !== l.from.getTime() ? ` to ${fmtShort(fromDbDate(l.to))}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No leave booked.</p>
          )}
          <h3 className="mt-4 mb-2 text-[13px] tracking-wider text-muted uppercase">Holidays</h3>
          {holidays.length ? (
            <ul className="grid gap-2">
              {holidays.map((h) => (
                <li key={h.id}>
                  <span className="font-mono text-[13px]">{fmtShort(fromDbDate(h.date))}</span> {h.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No holidays ahead.</p>
          )}
        </Card>
      </Two>
    </Stack>
  );
}
