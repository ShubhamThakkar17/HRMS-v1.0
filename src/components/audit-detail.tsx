import type { Prisma } from '@prisma/client';

/** Show before/after changes readably, falling back to compact JSON. */
export function AuditDetail({ detail }: { detail: Prisma.JsonValue | null }) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail))
    return <span className="text-muted">—</span>;
  const d = detail as Record<string, unknown>;
  const changes = d.changes as Record<string, { before: unknown; after: unknown }> | undefined;
  const fmt = (v: unknown) =>
    v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (changes && typeof changes === 'object') {
    return (
      <ul className="grid gap-0.5 text-[13px]">
        {Object.entries(changes).map(([k, v]) => (
          <li key={k}>
            <b>{k}</b>: <span className="text-bad line-through">{fmt(v.before)}</span> →{' '}
            <span className="text-good">{fmt(v.after)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const rest = Object.entries(d).filter(([k]) => k !== 'before' && k !== 'after');
  return (
    <div className="grid gap-0.5 text-[13px] [overflow-wrap:anywhere]">
      {'before' in d || 'after' in d ? (
        <div>
          <span className="text-muted">before</span> {fmt(d.before)}{' '}
          <span className="text-muted">→ after</span> {fmt(d.after)}
        </div>
      ) : null}
      {rest.length ? (
        <div className="font-mono text-xs text-muted">
          {rest
            .map(([k, v]) => `${k}: ${fmt(v)}`)
            .join(' · ')
            .slice(0, 400)}
        </div>
      ) : null}
    </div>
  );
}
