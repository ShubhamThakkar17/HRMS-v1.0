// Migrates and seeds the e2e database (DATABASE_URL is set by playwright.config.ts).
import { execSync } from 'node:child_process';

execSync('npx prisma migrate deploy', { stdio: 'inherit' });
execSync('npx prisma db seed', { stdio: 'inherit' });
