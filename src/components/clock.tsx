'use client';
import { useEffect, useState } from 'react';

function ist(d: Date) {
  return new Date(d.getTime() + 330 * 60_000).toISOString();
}

/** Live IST clock (HH:mm, with seconds optional). Renders nothing on the server to avoid a mismatch. */
export function LiveClock({ seconds = false }: { seconds?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="tabular-nums opacity-0">00:00</span>;
  const s = ist(now);
  return <span className="tabular-nums">{seconds ? s.slice(11, 19) : s.slice(11, 16)}</span>;
}

/** Time since an instant, ticking every second: 3h 12m 05s. */
export function Elapsed({ since }: { since: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const start = Date.parse(since);
    const tick = () => setMs(Date.now() - start);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [since]);
  if (ms === null) return <span className="tabular-nums">…</span>;
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span className="tabular-nums">
      {h}h {String(m).padStart(2, '0')}m{' '}
      <span className="opacity-70">{String(s % 60).padStart(2, '0')}s</span>
    </span>
  );
}
