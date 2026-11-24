import 'server-only';
import { db } from './db';

/** Sliding-window rate limit backed by Postgres, so it works across serverless instances. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const count = await db.rateEvent.count({ where: { key, at: { gt: since } } });
  if (count >= limit) return false;
  await db.rateEvent.create({ data: { key } });
  return true;
}

/** Check without recording (for counting failures only). */
export async function isLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  return (await db.rateEvent.count({ where: { key, at: { gt: since } } })) >= limit;
}

export async function recordEvent(key: string): Promise<void> {
  await db.rateEvent.create({ data: { key } });
}

export async function pruneRateEvents(olderThanMs = 86_400_000): Promise<number> {
  const r = await db.rateEvent.deleteMany({ where: { at: { lt: new Date(Date.now() - olderThanMs) } } });
  return r.count;
}
