// One place that builds a PrismaClient on top of node-postgres (no native query engine).
// Used by the app (src/server/db.ts), the seed and the tests.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaClient(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL is not set');
  const u = new URL(url);
  const schema = u.searchParams.get('schema') ?? undefined;
  // Prisma-only parameters that node-postgres does not understand.
  for (const p of ['schema', 'pgbouncer', 'connection_limit', 'pool_timeout']) u.searchParams.delete(p);
  // node-postgres already treats "require" as "verify-full"; say so explicitly (silences its warning).
  if (['require', 'prefer', 'verify-ca'].includes(u.searchParams.get('sslmode') ?? '')) u.searchParams.set('sslmode', 'verify-full');
  const adapter = new PrismaPg(
    { connectionString: u.toString(), max: Number(process.env.DB_POOL_MAX ?? 5) },
    { schema },
  );
  return new PrismaClient({ adapter });
}
