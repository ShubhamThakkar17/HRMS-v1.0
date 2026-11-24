import 'server-only';
import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { prisma?: PrismaClient };

/** Neon/PgBouncer pooled URLs need Prisma's pgbouncer mode (no named prepared statements). */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !/-pooler\.|pgbouncer/.test(url) || /[?&]pgbouncer=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

export const db = g.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });
if (process.env.NODE_ENV !== 'production') g.prisma = db;

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
