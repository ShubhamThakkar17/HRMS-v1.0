// Vercel build step: apply migrations, and on a brand-new demo database load the sample company.
// Uses the direct (unpooled) connection for migrations when the Neon integration provides one.
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!direct) {
  console.error('DATABASE_URL is not set. Connect a Postgres database to this Vercel project first.');
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: direct };
execSync('npx prisma migrate deploy', { stdio: 'inherit', env });

if (process.env.SEED_DEMO === 'true') {
  const db = new PrismaClient({ datasourceUrl: direct });
  const count = await db.employee.count();
  await db.$disconnect();
  if (count === 0) {
    console.log('Empty database and SEED_DEMO=true: loading the sample company.');
    execSync('npx prisma db seed', { stdio: 'inherit', env });
  } else {
    console.log(`Database already has ${count} employees; not seeding.`);
  }
}
