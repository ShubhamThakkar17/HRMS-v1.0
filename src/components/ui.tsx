// Shared server-safe UI pieces.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { STATUS_LABEL, type DisplayCode } from '@/lib/attendance-rules';

export function PageHead({
  title,
  lead,
  actions,
  eyebrow,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {lead ? <p className="mt-1.5 max-w-[68ch] text-[14.5px] text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  extra,
  children,
  className = '',
  icon,
  sub,
}: {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand [&>svg]:size-4">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2>{title}</h2>
              {sub ? <p className="text-[13px] text-muted">{sub}</p> : null}
            </div>
          </div>
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone,
  icon,
  chart,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'warn' | 'good' | 'bad';
  icon?: ReactNode;
  chart?: ReactNode;
}) {
  const toneCls =
    tone === 'warn'
      ? 'bg-warn-bg text-warn'
      : tone === 'bad'
        ? 'bg-bad-bg text-bad'
        : tone === 'good'
          ? 'bg-good-bg text-good'
          : 'bg-brand-soft text-brand';
  return (
    <div className="card card-hover relative overflow-hidden !p-4.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-muted">{label}</div>
        {icon ? (
          <span className={`grid size-8 place-items-center rounded-lg [&>svg]:size-4 ${toneCls}`}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">{value}</div>
        {chart}
      </div>
      {sub ? <div className="mt-2 text-[12.5px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function Kpis({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {children}
    </div>
  );
}

/** Page wrapper: children rise in, one after another. */
export function Stack({ children }: { children: ReactNode }) {
  return <div className="rise grid gap-5">{children}</div>;
}

export function Two({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`grid grid-cols-1 gap-5 ${wide ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : 'lg:grid-cols-2'}`}
    >
      {children}
    </div>
  );
}

const TONE = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  bad: 'bg-bad-bg text-bad',
  grey: 'bg-soft text-muted',
  dashed: 'border border-dashed border-line text-faint',
} as const;
const DOT = {
  good: 'bg-good',
  warn: 'bg-warn',
  info: 'bg-info',
  bad: 'bg-bad',
  grey: 'bg-faint',
  dashed: 'bg-line',
} as const;

export function Pill({
  tone,
  children,
  dot = true,
}: {
  tone: keyof typeof TONE;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`chip ${TONE[tone]}`}>
      {dot && tone !== 'dashed' ? <span className={`size-1.5 rounded-full ${DOT[tone]}`} /> : null}
      {children}
    </span>
  );
}

export const DAY_TONE: Record<DisplayCode, keyof typeof TONE> = {
  PRESENT: 'good',
  LATE: 'warn',
  SHORT: 'warn',
  LEAVE: 'info',
  ABSENT: 'bad',
  PENDING: 'grey',
  WEEKEND: 'dashed',
  HOLIDAY: 'dashed',
  UPCOMING: 'dashed',
  NOT_JOINED: 'dashed',
};

export function DayPill({ status, label }: { status: DisplayCode; label?: string }) {
  return <Pill tone={DAY_TONE[status]}>{label ?? STATUS_LABEL[status]}</Pill>;
}

const REQ_TONE: Record<string, keyof typeof TONE> = {
  PENDING: 'grey',
  APPROVED: 'good',
  REJECTED: 'bad',
  CANCELLED: 'grey',
  REIMBURSED: 'info',
  ACTIVE: 'good',
  INACTIVE: 'grey',
};
const REQ_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  REIMBURSED: 'Reimbursed',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};
export function StatusPill({ status }: { status: string }) {
  return <Pill tone={REQ_TONE[status] ?? 'grey'}>{REQ_LABEL[status] ?? status}</Pill>;
}

export function Table({
  head,
  children,
  empty,
  rows,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: string;
  rows: number;
}) {
  if (!rows) return <Empty>{empty ?? 'Nothing to show yet.'}</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={typeof h === 'string' && h.startsWith('#') ? 'num' : ''}>
                {typeof h === 'string' && h.startsWith('#') ? h.slice(1) : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 py-8 text-center text-sm text-muted">
      <span className="grid size-11 place-items-center rounded-full bg-soft text-faint [&>svg]:size-5">
        {icon ?? <Inbox />}
      </span>
      {children}
    </div>
  );
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' | 'bad' }) {
  const cls =
    tone === 'warn'
      ? 'bg-warn-bg border-[#f1dcb1]'
      : tone === 'bad'
        ? 'bg-bad-bg border-[#f0c9c3]'
        : 'bg-info-bg border-[#cbdaf2]';
  return (
    <section className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${cls}`}>
      {children}
    </section>
  );
}

const AVATAR_BG = ['#e6f2ed', '#e5eefb', '#fdf1dc', '#fbe7e4', '#efe9fb', '#e3f4f4'];
const AVATAR_FG = ['#0d5c48', '#2c5aa0', '#9a5b06', '#b23a2c', '#6b46c1', '#0f6b6b'];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const i = h % AVATAR_BG.length;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: AVATAR_BG[i],
        color: AVATAR_FG[i],
        fontSize: size * 0.36,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[13px] text-muted">{k}</dt>
          <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MonthNav({
  ym,
  label,
  base,
  extra = '',
}: {
  ym: string;
  label: string;
  base: string;
  extra?: string;
}) {
  const [y, m] = ym.split('-').map(Number);
  const prev = new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 7);
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1">
      <Link
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink"
        href={`${base}?month=${prev}${extra}`}
        aria-label="Previous month"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-32 text-center text-sm font-semibold">{label}</span>
      <Link
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink"
        href={`${base}?month=${next}${extra}`}
        aria-label="Next month"
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

/** Segmented tabs rendered as links (keeps pages server-rendered). */
export function Tabs({
  items,
  current,
}: {
  items: { href: string; label: string; key: string }[];
  current: string;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-white p-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium no-underline transition-colors ${t.key === current ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// Back-compat re-exports for older pages.
export { BarList as Bars, Columns as ColumnChart } from './charts';
