import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
const dbUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hrms_e2e?schema=public';

// Run `npm run build` first. The server runs against a separate, freshly seeded database.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/e2e-db.mjs && npx next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: dbUrl,
      AUTH_DEMO: 'true',
      AUTH_TRUST_HOST: 'true',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-00',
      FACE_TEMPLATE_KEY: process.env.FACE_TEMPLATE_KEY ?? Buffer.alloc(32, 7).toString('base64'),
      APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 9).toString('base64'),
      CRON_SECRET: 'e2e-cron-secret',
      STORAGE_DRIVER: 'local',
    },
  },
});
