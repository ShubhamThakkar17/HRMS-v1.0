'use client';
import { useEffect, useState } from 'react';

export function KioskCode({
  deviceId,
  token,
  initial,
}: {
  deviceId: string;
  token: string;
  initial: { code: string; secondsLeft: number };
}) {
  const [state, setState] = useState(initial);
  const [left, setLeft] = useState(initial.secondsLeft);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const r = await fetch(`/api/kiosk/${deviceId}/code?k=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const j = (await r.json()) as { code?: string; secondsLeft?: number; error?: string };
        if (!alive) return;
        if (!r.ok || !j.code) return setError(j.error ?? 'Lost connection');
        setError('');
        setState({ code: j.code, secondsLeft: j.secondsLeft! });
        setLeft(j.secondsLeft!);
      } catch {
        if (alive) setError('Offline. Reconnecting…');
      }
    };
    const tick = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          void refresh();
          return 30;
        }
        return s - 1;
      });
    }, 1000);
    const resync = setInterval(refresh, 15_000);
    return () => {
      alive = false;
      clearInterval(tick);
      clearInterval(resync);
    };
  }, [deviceId, token]);

  return (
    <>
      <div className="mt-3 text-sm tracking-[0.12em] uppercase opacity-70">Office code</div>
      <div
        className="font-mono text-[clamp(48px,11vw,112px)] font-medium tracking-[0.12em] tabular-nums"
        aria-live="polite"
      >
        {state.code.slice(0, 3)} {state.code.slice(3)}
      </div>
      <div className="h-1.5 w-[min(380px,80vw)] overflow-hidden rounded bg-white/15">
        <span
          className="block h-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / 30) * 100}%` }}
        />
      </div>
      <div className="text-sm opacity-70">Changes in {left} s</div>
      {error ? <div className="text-sm text-[#f2c14e]">{error}</div> : null}
    </>
  );
}
