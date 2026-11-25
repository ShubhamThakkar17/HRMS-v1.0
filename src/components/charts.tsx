// Lightweight SVG charts, rendered on the server and animated with CSS (see globals.css).
// No chart library is shipped to the browser.
import type { CSSProperties, ReactNode } from 'react';

export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

let seq = 0;
const uid = (p: string) => `${p}${(seq = (seq + 1) % 1e6)}`;

/** Smooth path through points (Catmull-Rom converted to cubic Béziers, clamped vertically). */
function smoothPath(pts: [number, number][], minY: number, maxY: number): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0]![0]},${pts[0]![1]}`;
  const clamp = (y: number) => Math.min(maxY, Math.max(minY, y));
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function AreaChart({
  points,
  max = 100,
  suffix = '%',
  height = 220,
  color = 'var(--c1)',
}: {
  points: { label: string; value: number; title?: string }[];
  max?: number;
  suffix?: string;
  height?: number;
  color?: string;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 12, t: 14, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = Math.max(1, points.length - 1);
  const xy = points.map((p, i): [number, number] => [
    pad.l + (i / n) * iw,
    pad.t + ih - (Math.min(p.value, max) / max) * ih,
  ]);
  const line = smoothPath(xy, pad.t, pad.t + ih);
  const area = xy.length
    ? `${line} L${xy[xy.length - 1]![0]},${pad.t + ih} L${xy[0]![0]},${pad.t + ih} Z`
    : '';
  const gid = uid('ag');
  const every = Math.ceil(points.length / 8);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label="Trend chart"
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = pad.t + ih - g * ih;
        return (
          <g key={g}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y}
              y2={y}
              stroke="var(--line)"
              strokeDasharray={g ? '3 5' : undefined}
            />
            <text x={pad.l - 8} y={y + 4} textAnchor="end" className="fill-faint text-[11px]">
              {Math.round(g * max)}
              {suffix}
            </text>
          </g>
        );
      })}
      <path d={area} fill={`url(#${gid})`} className="reveal-x" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        pathLength={1}
        className="draw"
        style={{ '--len': 1 } as CSSProperties}
      />
      {xy.map(([x, y], i) => (
        <g key={i}>
          <circle
            cx={x}
            cy={y}
            r={i === xy.length - 1 ? 5 : 3}
            fill="white"
            stroke={color}
            strokeWidth={2}
            className="anim-pop"
            style={{ animationDelay: `${600 + i * 40}ms` }}
          >
            <title>{points[i]!.title ?? `${points[i]!.label}: ${points[i]!.value}${suffix}`}</title>
          </circle>
          {i % every === 0 || i === xy.length - 1 ? (
            <text
              x={x}
              y={H - 8}
              textAnchor="middle"
              className={`text-[11px] ${i === xy.length - 1 ? 'fill-ink font-semibold' : 'fill-faint'}`}
            >
              {points[i]!.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export interface Segment {
  label: string;
  value: number;
  color?: string;
}

/** Donut with a centre label. Segments draw in one after another. */
export function Donut({
  segments,
  size = 168,
  thickness = 18,
  center,
  sub,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  sub?: ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  let acc = 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          const gap = segments.length > 1 && pct > 2 ? 1.2 : 0;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={thickness}
              strokeLinecap="butt"
              pathLength={100}
              strokeDasharray={`${Math.max(0, pct - gap)} ${100 - Math.max(0, pct - gap)}`}
              strokeDashoffset={-acc}
              className="seg"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <title>{`${s.label}: ${s.value} (${Math.round(pct)}%)`}</title>
            </circle>
          );
          acc += pct;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        {center !== undefined ? <div className="text-2xl font-semibold tabular-nums">{center}</div> : null}
        {sub ? <div className="text-xs text-muted">{sub}</div> : null}
      </div>
    </div>
  );
}

/** Single progress ring (0–1). */
export function Ring({
  value,
  size = 96,
  thickness = 10,
  color = 'var(--c1)',
  children,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} ${100 - pct}`}
          className="seg"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  );
}

/** Vertical columns with labels; the last one is highlighted. */
export function Columns({
  bars,
  max,
  suffix = '',
  height = 200,
  highlightLast = false,
}: {
  bars: { label: string; value: number; title?: string; color?: string }[];
  max?: number;
  suffix?: string;
  height?: number;
  highlightLast?: boolean;
}) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  // Width follows the number of bars so labels stay readable when the chart is scaled down.
  const W = Math.max(320, bars.length * 78);
  const H = height;
  const pad = { l: 8, r: 8, t: 22, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / Math.max(1, bars.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Bar chart">
      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--line)" />
      {bars.map((b, i) => {
        const h = Math.max(2, (b.value / top) * ih);
        const x = pad.l + i * bw + bw * 0.2;
        const last = highlightLast && i === bars.length - 1;
        const fill =
          b.color ??
          (highlightLast
            ? last
              ? 'var(--c1)'
              : 'color-mix(in srgb, var(--c1) 45%, white)'
            : PALETTE[i % PALETTE.length]);
        return (
          <g key={b.label}>
            <rect
              x={x}
              y={pad.t + ih - h}
              width={bw * 0.6}
              height={h}
              rx={7}
              fill={fill}
              className="bar-y"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <title>{b.title ?? `${b.label}: ${b.value}${suffix}`}</title>
            </rect>
            <text
              x={x + bw * 0.3}
              y={pad.t + ih - h - 6}
              textAnchor="middle"
              className="anim-fade fill-muted text-[13px] font-medium"
              style={{ animationDelay: `${500 + i * 45}ms` }}
            >
              {b.value}
              {suffix}
            </text>
            <text
              x={x + bw * 0.3}
              y={H - 9}
              textAnchor="middle"
              className={`text-[13px] ${last ? 'fill-ink font-semibold' : 'fill-faint'}`}
            >
              {b.label.length > 12 ? `${b.label.slice(0, 11)}…` : b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bar list with values. */
export function BarList({
  rows,
  color,
}: {
  rows: { label: string; value: number; display: string; hint?: string }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-muted">Nothing to show yet.</p>;
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={r.label} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {r.display}
              {r.hint ? <span className="ml-1.5 text-xs font-normal text-muted">{r.hint}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-soft">
            <span
              className="bar-x block h-full rounded-full"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: color ?? PALETTE[i % PALETTE.length],
                animationDelay: `${i * 70}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({
  values,
  color = 'var(--c2)',
  width = 96,
  height = 32,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i): [number, number] => [
    (i / (values.length - 1)) * width,
    height - 3 - ((v - min) / span) * (height - 6),
  ]);
  const d = smoothPath(pts, 1, height - 1);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="overflow-visible"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        pathLength={1}
        className="draw"
        style={{ '--len': 1 } as CSSProperties}
      />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.8} fill={color} />
    </svg>
  );
}

/** One horizontal bar split into parts, with a legend. */
export function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="grid gap-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-soft">
        {total
          ? segments.map((s, i) => (
              <span
                key={s.label}
                title={`${s.label}: ${s.value}`}
                className="bar-x block h-full"
                style={{
                  width: `${(s.value / total) * 100}%`,
                  background: s.color ?? PALETTE[i % PALETTE.length],
                  animationDelay: `${i * 90}ms`,
                }}
              />
            ))
          : null}
      </div>
      <Legend items={segments} />
    </div>
  );
}

export function Legend({ items, values = false }: { items: Segment[]; values?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted">
      {items.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ background: s.color ?? PALETTE[i % PALETTE.length] }}
          />
          {s.label}
          {values ? <b className="font-semibold text-ink tabular-nums">{s.value}</b> : null}
        </li>
      ))}
    </ul>
  );
}
