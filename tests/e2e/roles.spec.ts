import { expect, test } from '@playwright/test';
import { login, navLabels } from './helpers';

const EXPECT: Record<string, { has: string[]; not: string[] }> = {
  aditya: {
    has: [
      'Roles and permissions',
      'Settings',
      'Office kiosk',
      'Audit log',
      'Executive dashboard',
      'Google Sheets sync',
    ],
    not: [],
  },
  meera: {
    has: ['Executive dashboard', 'Reports', 'Payroll preview', 'Audit log', 'Team overview'],
    not: ['Settings', 'Roles and permissions', 'Expense claims'],
  },
  priya: {
    has: ['Employee records', 'Attendance', 'Leave', 'Google Sheets sync', 'Audit log', 'Approvals'],
    not: ['Executive dashboard', 'Payroll preview', 'Settings'],
  },
  pooja: {
    has: ['Employee records', 'Attendance', 'Leave'],
    not: ['Approvals', 'Audit log', 'Roles and permissions'],
  },
  neha: {
    has: ['Expense claims', 'Payroll preview', 'Reports', 'Approvals'],
    not: ['Team overview', 'Executive dashboard', 'Attendance'],
  },
  rohan: { has: ['Team overview', 'Team attendance', 'Approvals'], not: ['Employee records', 'Reports'] },
  ananya: {
    has: ['Home', 'Punch in and out', 'My leave', 'Directory'],
    not: ['Approvals', 'Team overview', 'Employee records'],
  },
};

test.describe('menus per role', () => {
  for (const [who, exp] of Object.entries(EXPECT)) {
    test(`${who} sees only allowed items`, async ({ page }) => {
      await login(page, who);
      const labels = await navLabels(page);
      for (const l of exp.has) expect(labels).toContain(l);
      for (const l of exp.not) expect(labels).not.toContain(l);
    });
  }
});

test('a person with two roles can switch and the menu changes', async ({ page }) => {
  await login(page, 'priya');
  expect(await navLabels(page)).toContain('Employee records');
  await page.getByLabel('Viewing as').selectOption('Employee');
  await expect(page.getByText('viewing as Employee')).toBeVisible();
  expect(await navLabels(page)).not.toContain('Employee records');
  await page.getByLabel('Viewing as').selectOption('HR Admin');
  await expect(page.getByText('viewing as HR Admin')).toBeVisible();
});

test('pages and API routes refuse people without the permission', async ({ page }) => {
  await login(page, 'ananya');
  await page.goto('/hr/employees');
  await expect(page).toHaveURL('/');
  const csv = await page.request.get('/api/export/expenses');
  expect(csv.status()).toBe(403);
  const tmpl = await page.request.get('/api/import-template');
  expect(tmpl.status()).toBe(403);
});

test('anonymous and cross-site requests are refused', async ({ request }) => {
  expect((await request.get('/api/me/export')).status()).toBe(401);
  expect((await request.get('/api/cron/finalise-day')).status()).toBe(401);
  const punch = await request.post('/api/punch', {
    data: { method: 'WEB' },
    headers: { origin: 'https://evil.example' },
  });
  expect(punch.status()).toBe(403);
});
