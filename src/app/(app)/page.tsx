import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck2,
  CalendarHeart,
  Clock3,
  Fingerprint,
  Megaphone,
  PartyPopper,
  Pin,
  Timer,
} from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceRange } from '@/server/services/attendance';
import { balancesFor } from '@/server/services/leave';
import { approvalsCount } from '@/server/services/approvals';
import { canSeeApprovals } from '@/lib/permissions';
import {
  addDays,
  businessDate,
  fmtDate,
  fmtShort,
  fmtWeekday,
  fromDbDate,
  istTime,
  toDbDate,
  weekdayIndex,
} from '@/lib/dates';
import { METHOD_LABEL, countsAsPresent, type DayStatusCode } from '@/lib/attendance-rules';
import { Card, DayPill, Empty, StatusPill } from '@/components/ui';
import { Columns, Ring } from '@/components/charts';
import { CountUp } from '@/components/count-up';
import { Elapsed, LiveClock } from '@/components/clock';

export default async function Home() {
  const user = await requireUser();
  const today = businessDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekStart = addDays(today, -((weekdayIndex(today) + 6) % 7)); // Monday
  const from = weekStart < monthStart ? weekStart : monthStart;
  const [days, balances, anns, upcoming, holidays, waiting] = await Promise.all([
    attendanceRange(user.id, from, today),
    balancesFor(user.id),
    db.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 3,
      include: { author: true },
    }),
    db.leaveRequest.findMany({
      where: { employeeId: user.id, to: { gte: toDbDate(today) }, status: { in: ['PENDING', 'APPROVED'] } },
      orderBy: { from: 'asc' },
      take: 4,
      include: { leaveType: true },
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
  const day = days[days.length - 1]!;
  const hour = Number(new Date(Date.now() + 330 * 60_000).toISOString().slice(11, 13));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const month = days.filter((d) => d.date >= monthStart && d.date < today);
  const expected = month.filter((d) => ['PRESENT', 'LATE', 'SHORT', 'ABSENT'].includes(d.status)).length;
  const present = month.filter((d) => countsAsPresent(d.status as DayStatusCode)).length;
  const late = month.filter((d) => d.status === 'LATE').length;
  const rate = expected ? present / expected : 1;
  const week = days.filter(
    (d) => d.date >= weekStart && weekdayIndex(d.date) >= 1 && weekdayIndex(d.date) <= 5,
  );
  const weekBars = [0, 1, 2, 3, 4].map((i) => {
    const date = addDays(weekStart, i);
    const d = week.find((x) => x.date === date);
    return { date, hours: d?.hours ?? 0, status: d?.status ?? 'UPCOMING' };
  });
  const weekHours = week.reduce((s, d) => s + (d.hours ?? 0), 0);
  const leaveLeft = balances.reduce((s, b) => s + b.available, 0);
  const workedToday = day.hours ?? 0;

  return (
    <div className="rise grid gap-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand via-brand to-brand-deep p-5 text-white shadow-[var(--shadow-lg)] md:p-7">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-glow/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="grid gap-3">
            <div className="text-sm text-white/70">
              {fmtWeekday(today)}, {fmtDate(today)} · viewing as {user.activeRole}
            </div>
            <h1 className="!text-[28px] md:!text-[34px]">
              {greet}, {user.name.split(' ')[0]}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5 text-[15px]">
              <DayPill status={day.status} label={day.holidayName} />
              <span className="text-white/85">
                {day.firstIn
                  ? `In at ${istTime(day.firstIn)} by ${(METHOD_LABEL[day.inMethod ?? ''] ?? '').toLowerCase()}${day.lastOut ? ` · out at ${istTime(day.lastOut)}` : ''}`
                  : 'Not checked in yet'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {!day.lastOut ? (
                <Link
                  href="/punch"
                  className="btn btn-lg !border-white !bg-white !text-brand hover:!bg-brand-soft"
                >
                  <Fingerprint className="size-5" />
                  {day.firstIn ? 'Check out' : 'Check in now'}
                </Link>
              ) : (
                <span className="chip bg-white/15 text-white">
                  <CalendarCheck2 className="size-3.5" /> Done for today
                </span>
              )}
              {waiting ? (
                <Link
                  href="/approvals"
                  className="btn btn-lg !border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
                >
                  {waiting} to approve <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
            <div className="text-[40px] leading-none font-semibold tracking-tight md:text-[56px]">
              <LiveClock />
              <span className="ml-2 text-base font-medium text-white/60">IST</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 pr-4 backdrop-blur">
              <Ring
                value={Math.min(1, (day.firstIn && !day.lastOut ? 0.0001 : workedToday) / 9)}
                size={56}
                thickness={6}
                color="var(--brand-glow)"
              >
                <Timer className="size-4 text-white/80" />
              </Ring>
              <div>
                <div className="text-xs text-white/60">Worked today</div>
                <div className="text-lg font-semibold whitespace-nowrap">
                  {day.firstIn && !day.lastOut ? (
                    <Elapsed since={day.firstIn.toISOString()} />
                  ) : (
                    `${workedToday} h`
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="card card-hover flex items-center gap-3 !p-4">
          <Ring value={rate} size={58} thickness={6}>
            <span className="text-[13px] font-semibold">{Math.round(rate * 100)}%</span>
          </Ring>
          <div className="min-w-0">
            <div className="text-[13px] leading-tight text-muted">Attendance</div>
            <div className="text-sm font-medium whitespace-nowrap">
              {present}/{expected} days
            </div>
          </div>
        </div>
        <div className="card card-hover !p-4">
          <div className="flex items-center justify-between text-[13px] text-muted">
            Hours this week <Clock3 className="size-4 text-brand" />
          </div>
          <div className="mt-2 text-[26px] font-semibold">
            <CountUp value={weekHours} format="dec" />
            <span className="ml-1 text-sm font-normal text-muted">h</span>
          </div>
        </div>
        <div className="card card-hover !p-4">
          <div className="flex items-center justify-between text-[13px] text-muted">
            Late arrivals <Timer className="size-4 text-warn" />
          </div>
          <div className="mt-2 text-[26px] font-semibold">
            <CountUp value={late} />
            <span className="ml-1 text-sm font-normal text-muted">this month</span>
          </div>
        </div>
        <Link href="/my/leave" className="card card-hover !p-4 text-ink no-underline">
          <div className="flex items-center justify-between text-[13px] text-muted">
            Leave available <CalendarHeart className="size-4 text-info" />
          </div>
          <div className="mt-2 text-[26px] font-semibold">
            <CountUp value={leaveLeft} />
            <span className="ml-1 text-sm font-normal text-muted">days</span>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title="This week"
          sub="Hours worked each day"
          icon={<Clock3 />}
          extra={
            <Link href="/my/attendance" className="text-sm">
              Details
            </Link>
          }
        >
          <Columns
            height={190}
            suffix="h"
            max={10}
            bars={weekBars.map((d) => ({
              label: fmtWeekday(d.date),
              value: d.hours,
              title: `${fmtShort(d.date)}: ${d.hours} h`,
              color:
                d.date === today
                  ? 'var(--c2)'
                  : d.status === 'LATE'
                    ? 'var(--c3)'
                    : d.status === 'LEAVE'
                      ? 'var(--c4)'
                      : 'var(--c1)',
            }))}
          />
        </Card>
        <Card
          title="Leave balance"
          icon={<CalendarHeart />}
          extra={
            <Link href="/my/leave" className="text-sm">
              Apply
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {balances.map((b, i) => (
              <div key={b.code} className="grid justify-items-center gap-1.5 text-center">
                <Ring
                  value={b.opening + b.accrued ? b.remaining / (b.opening + b.accrued) : 0}
                  size={76}
                  thickness={8}
                  color={['var(--c1)', 'var(--c4)', 'var(--c3)'][i % 3]}
                >
                  <span className="text-lg font-semibold">{b.remaining}</span>
                </Ring>
                <div className="text-[13px] font-medium">{b.name.replace(' leave', '')}</div>
                <div className="text-xs text-muted">
                  of {b.opening + b.accrued}
                  {b.pending ? ` · ${b.pending} pending` : ''}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title="Announcements"
          icon={<Megaphone />}
          extra={
            <Link href="/announcements" className="text-sm">
              All
            </Link>
          }
        >
          {anns.length ? (
            <div className="grid gap-1">
              {anns.map((a) => (
                <article
                  key={a.id}
                  className="grid gap-1 rounded-xl p-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned ? <Pin className="size-3.5 text-info" /> : null}
                    <strong className="text-[15px]">{a.title}</strong>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted">{a.body}</p>
                  <p className="text-xs text-faint">
                    {a.author.name} · {fmtShort(businessDate(a.publishedAt))}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <Empty>No announcements.</Empty>
          )}
        </Card>
        <Card title="Coming up" icon={<PartyPopper />}>
          <ul className="grid gap-2.5">
            {upcoming.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {l.leaveType.name}, {fmtShort(fromDbDate(l.from))}
                  {l.to.getTime() !== l.from.getTime() ? ` – ${fmtShort(fromDbDate(l.to))}` : ''}
                </span>
                <StatusPill status={l.status} />
              </li>
            ))}
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{h.name}</span>
                <span className="chip bg-soft text-muted">{fmtShort(fromDbDate(h.date))}</span>
              </li>
            ))}
            {!upcoming.length && !holidays.length ? <Empty>Nothing booked.</Empty> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
