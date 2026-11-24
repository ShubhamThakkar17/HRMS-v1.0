// Shared server-safe UI pieces.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { STATUS_LABEL, type DisplayCode } from '@/lib/attendance-rules';

export function PageHead({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-1 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {lead ? <p className="mt-1.5 max-w-[70ch] text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5 no-print">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  extra,
  children,
  className = '',
}: {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2.5">
          <h2>{title}</h2>
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
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'warn';
}) {
  return (
    <div className={`card ${tone === 'warn' ? 'border-l-4 border-l-[#e2a33a]' : ''}`}>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 text-[13px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function Kpis({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">{children}</div>;
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="grid gap-4">{children}</div>;
}

export function Two({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
}

const TONE = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  bad: 'bg-bad-bg text-bad',
  grey: 'bg-[#eceeee] text-muted',
  dashed: 'border border-dashed border-[#c9d3cf] text-muted',
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const DAY_TONE: Record<DisplayCode, keyof typeof TONE> = {
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
  if (!rows) return <p className="py-1.5 text-muted">{empty ?? 'Nothing to show yet.'}</p>;
  return (
    <div className="overflow-x-auto">
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-1.5 text-muted">{children}</p>;
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' | 'bad' }) {
  const cls =
    tone === 'warn'
      ? 'bg-warn-bg border-[#eed7aa]'
      : tone === 'bad'
        ? 'bg-bad-bg border-[#e9c1bb]'
        : 'bg-info-bg border-[#c6d4ea]';
  return (
    <section className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${cls}`}>{children}</section>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <div className="grid size-10 flex-none place-items-center rounded-full bg-soft text-sm font-bold text-brand">
      {initials}
    </div>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[13px] text-muted">{k}</dt>
          <dd className="m-0">{v}</dd>
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
    <div className="flex items-center gap-2">
      <Link
        className="btn btn-ghost btn-sm"
        href={`${base}?month=${prev}${extra}`}
        aria-label="Previous month"
      >
        ‹
      </Link>
      <span className="min-w-36 text-center font-medium">{label}</span>
      <Link className="btn btn-ghost btn-sm" href={`${base}?month=${next}${extra}`} aria-label="Next month">
        ›
      </Link>
    </div>
  );
}

/** Horizontal bars, values as percentages of max. */
export function Bars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[110px_minmax(0,1fr)_80px] items-center gap-3 text-sm md:grid-cols-[150px_minmax(0,1fr)_90px]"
        >
          <span className="truncate">{r.label}</span>
          <div className="h-2.5 overflow-hidden rounded-md bg-[#e4ebe8]">
            <span
              className="block h-full rounded-md bg-brand"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <strong className="text-right tabular-nums">{r.display}</strong>
        </div>
      ))}
    </div>
  );
}

/** Vertical bar chart (SVG). */
export function ColumnChart({
  points,
  max = 100,
  suffix = '%',
}: {
  points: { label: string; value: number; title?: string }[];
  max?: number;
  suffix?: string;
}) {
  const W = 640;
  const H = 200;
  const pad = { l: 34, r: 8, t: 10, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / Math.max(1, points.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Bar chart">
      {[0, 25, 50, 75, 100].map((g) => {
        const y = pad.t + ih - (g / 100) * ih;
        return (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#e4ebe8" />
            <text x={pad.l - 6} y={y + 4} textAnchor="end" className="fill-muted text-[11px]">
              {Math.round((g / 100) * max)}
              {suffix}
            </text>
          </g>
        );
      })}
      {points.map((p, i) => {
        const h = (Math.min(p.value, max) / max) * ih;
        const x = pad.l + i * bw + bw * 0.18;
        const last = i === points.length - 1;
        return (
          <g key={p.label}>
            <rect
              x={x}
              y={pad.t + ih - h}
              width={bw * 0.64}
              height={h}
              rx={3}
              fill={last ? 'var(--brand)' : '#7fa89a'}
            >
              <title>{p.title ?? `${p.label}: ${p.value}${suffix}`}</title>
            </rect>
            <text
              x={x + bw * 0.32}
              y={H - 10}
              textAnchor="middle"
              className={`text-[11px] ${last ? 'fill-ink font-semibold' : 'fill-muted'}`}
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
