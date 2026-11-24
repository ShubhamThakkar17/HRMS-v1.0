// Applies migrations to the test database before unit/integration tests.
import { execSync } from 'node:child_process';

const url =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hrms_test?schema=public';
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
