'use client';
import { useEffect, useRef, useState } from 'react';

const fmt = {
  int: (n: number) => Math.round(n).toLocaleString('en-IN'),
  inr: (n: number) => '₹' + Math.round(n).toLocaleString('en-IN'),
  pct: (n: number) => `${Math.round(n)}%`,
  dec: (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN'),
};

/** Counts up to a number once when it first renders. Respects reduced-motion. */
export function CountUp({
  value,
  format = 'int',
  ms = 900,
}: {
  value: number;
  format?: keyof typeof fmt;
  ms?: number;
}) {
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) {
      setShown(value);
      return;
    }
    done.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{fmt[format](shown)}</span>;
}
