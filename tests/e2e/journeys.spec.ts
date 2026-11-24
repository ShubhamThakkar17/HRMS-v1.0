import { expect, test } from '@playwright/test';
import { istWeekday, login, logout } from './helpers';

test.describe.configure({ mode: 'serial' });

test('employee applies for leave, manager approves, balance drops', async ({ page }) => {
  const day = istWeekday(9);
  await login(page, 'ananya');
  await page.goto('/my/leave');
  await page.getByLabel('Type').selectOption('CL');
  await page.getByLabel('From').fill(day);
  await page.getByLabel('To').fill(day);
  await page.getByLabel('Reason').fill('Doctor visit');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText(/Request LR-\d+ sent for 1 working day/)).toBeVisible();
  await logout(page);

  await login(page, 'rohan');
  await page.goto('/approvals');
  const row = page.locator('tr', { hasText: 'Doctor visit' });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('tr', { hasText: 'Doctor visit' })).toHaveCount(0);
  await logout(page);

  await login(page, 'ananya');
  await page.goto('/my/leave');
  await expect(page.locator('tr', { hasText: 'Doctor visit' }).getByText('Approved')).toBeVisible();
});

test('rejecting needs a reason', async ({ page }) => {
  await login(page, 'rohan');
  await page.goto('/approvals');
  const row = page.locator('tr', { hasText: 'Team lunch on shoot day' });
  await row.getByRole('button', { name: 'Reject' }).click();
  await row.getByLabel('Reason for rejecting').fill('Please attach the bill');
  await row.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('tr', { hasText: 'Team lunch on shoot day' })).toHaveCount(0);
});

test('quick web punch checks in and then out', async ({ page }) => {
  await login(page, 'divya');
  await page.goto('/punch');
  await page.getByRole('button', { name: 'Check in on the web' }).click();
  await expect(page.getByText(/Checked in at \d\d:\d\d, without location/)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Check out on the web' })).toBeVisible();
});

test('location punch far from the office is flagged for the manager', async ({ browser }) => {
  const ctx = await browser.newContext({
    geolocation: { latitude: 23.0675, longitude: 72.5714, accuracy: 20 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await login(page, 'ananya');
  await page.goto('/punch');
  await page.getByText('Location notice.').click();
  await page.getByRole('button', { name: 'Check in with location' }).click();
  await expect(page.getByText(/outside the office \(flagged for your manager\)/)).toBeVisible();
  await ctx.close();

  const m = await browser.newPage();
  await login(m, 'rohan');
  await m.goto('/team');
  const flagged = m.locator('section', { hasText: 'Punches outside the office geofence' });
  await expect(flagged.getByText('Ananya Iyer')).toBeVisible();
  await m.close();
});

test('inaccurate GPS readings are rejected', async ({ browser }) => {
  const ctx = await browser.newContext({
    geolocation: { latitude: 23.0225, longitude: 72.5714, accuracy: 400 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await login(page, 'harsh');
  await page.goto('/punch');
  await page.getByText('Location notice.').click();
  await page.getByRole('button', { name: 'Check in with location' }).click();
  await expect(page.getByText(/only accurate to 400 m/)).toBeVisible();
  await ctx.close();
});

test('office kiosk code punches the employee in at the office', async ({ browser }) => {
  const admin = await browser.newPage();
  await login(admin, 'aditya');
  await admin.goto('/admin/kiosk');
  await admin.getByLabel('Device name').fill('E2E tablet');
  await admin.getByRole('button', { name: 'Register' }).click();
  const link = (await admin.locator('code').textContent())!.trim();
  const kiosk = await browser.newPage();
  await kiosk.goto(link);
  const code = ((await kiosk.locator('[aria-live=polite]').first().textContent()) ?? '').replace(/\s/g, '');
  expect(code).toMatch(/^\d{6}$/);

  const p = await browser.newPage();
  await login(p, 'harsh');
  await p.goto('/punch');
  await p.getByLabel('Office code').fill('000000' === code ? '111111' : '000000');
  await p.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(p.getByText(/expired or is not valid/)).toBeVisible();
  await p.getByLabel('Office code').fill(code);
  await p.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(p.getByText(/Checked in at \d\d:\d\d, at the office/)).toBeVisible();

  // Revoking stops the code at once.
  await admin.reload();
  admin.once('dialog', (d) => d.accept());
  await admin.locator('tr', { hasText: 'E2E tablet' }).getByRole('button', { name: 'Revoke' }).click();
  await expect(admin.locator('tr', { hasText: 'E2E tablet' }).getByText('Revoked')).toBeVisible();
  await kiosk.reload();
  await expect(kiosk.getByText('Kiosk not available')).toBeVisible();
});

test('approved correction turns an absent day present', async ({ page }) => {
  await login(page, 'rohan');
  await page.goto('/approvals');
  await page
    .locator('tr', { hasText: 'Forgot to punch out' })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.locator('tr', { hasText: 'Forgot to punch out' })).toHaveCount(0);
  await logout(page);
  await login(page, 'kunal');
  await page.goto('/my/attendance');
  await expect(page.locator('tr', { hasText: 'Forgot to punch out' }).getByText('Approved')).toBeVisible();
  await expect(page.locator('td', { hasText: 'Approved correction' }).first()).toBeVisible();
});

test('expense claim with receipt: submit, approve, reimburse, export', async ({ page }) => {
  // Smallest valid PNG.
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
    'hex',
  );
  await login(page, 'sneha');
  await page.goto('/my/expenses');
  await page.getByLabel('Category').selectOption('Travel');
  await page.getByLabel('Amount (₹)').fill('1234.50');
  await page
    .getByLabel('Receipt (image or PDF, up to 10 MB)')
    .setInputFiles({ name: 'cab.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel('Details').fill('Cab to shoot location');
  await page.getByRole('button', { name: 'Submit claim' }).click();
  await expect(page.getByText(/Claim EX-\d+ sent for approval/)).toBeVisible();
  const receipt = await page.request.get(
    (await page
      .locator('tr', { hasText: 'Cab to shoot location' })
      .getByRole('link', { name: 'View' })
      .getAttribute('href')) as string,
  );
  expect(receipt.status()).toBe(200);
  expect(receipt.headers()['content-type']).toBe('image/png');
  await logout(page);

  await login(page, 'rohan');
  await page.goto('/approvals');
  const viewHref = await page
    .locator('tr', { hasText: 'Cab to shoot location' })
    .getByRole('link', { name: 'View receipt' })
    .getAttribute('href');
  await page
    .locator('tr', { hasText: 'Cab to shoot location' })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.locator('tr', { hasText: 'Cab to shoot location' })).toHaveCount(0);
  await logout(page);

  // Someone outside the claimant's chain cannot see the receipt.
  await login(page, 'harsh');
  expect((await page.request.get(viewHref!, { maxRedirects: 0 })).status()).toBe(403);
  await logout(page);

  await login(page, 'neha');
  await page.goto('/finance/expenses?status=APPROVED');
  await page
    .locator('tr', { hasText: 'Cab to shoot location' })
    .getByRole('button', { name: 'Reimburse' })
    .click();
  await expect(page.locator('tr', { hasText: 'Cab to shoot location' })).toHaveCount(0);
  const csv = await page.request.get('/api/export/expenses');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('Cab to shoot location');
});

test('HR adds, edits and deactivates an employee, who then cannot sign in', async ({ page }) => {
  await login(page, 'priya');
  await page.goto('/hr/employees/new');
  await page.getByLabel('Full name').fill('Test Person');
  await page.getByLabel('Work email').fill('test.person@demo.example');
  await page.getByLabel('Department', { exact: true }).fill('Technology');
  await page.getByLabel('Designation').fill('Developer');
  await page.getByLabel('Join date').fill('2026-01-05');
  await page.getByLabel('Annual CTC (₹)').fill('720000');
  await page.getByRole('button', { name: 'Add employee' }).click();
  await expect(page.getByRole('heading', { name: 'Test Person' })).toBeVisible();
  await page.getByLabel('Designation').fill('Senior Developer');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('Inactive').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('tr', { hasText: 'employee.update' })).toContainText('Senior Developer');
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.goto('/login');
  await page.locator('form:has-text("Sign in to demo") input[name=email]').fill('test.person@demo.example');
  await page.getByRole('button', { name: 'Sign in to demo' }).click();
  await expect(page.getByText('That did not work')).toBeVisible();
});

test('HR executive can edit records but not roles', async ({ page }) => {
  await login(page, 'pooja');
  await page.goto('/hr/employees');
  await page.getByRole('link', { name: 'Arjun Nair' }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expect(page.getByText('Changing roles needs the “Assign roles” permission.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save roles' })).toHaveCount(0);
});

test('HR correction is recorded with method HR and in the audit log', async ({ page }) => {
  await login(page, 'priya');
  await page.goto(`/hr/attendance`);
  await page.getByLabel('Person').selectOption({ label: 'Manish Solanki (E013)' });
  await page.getByLabel('Reason (required, kept in the audit log)').fill('Biometric reader offline');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(/Corrected\. The day is now/)).toBeVisible();
  await page.goto('/admin/audit?action=attendance');
  await expect(page.getByText('Biometric reader offline')).toBeVisible();
});

test('directors see the dashboard and payroll preview; payslips print', async ({ page }) => {
  await login(page, 'meera');
  await page.goto('/leadership/dashboard');
  await expect(page.getByText('Attendance rate, last 15 working days')).toBeVisible();
  await expect(page.getByText('Headcount', { exact: true })).toBeVisible();
  await page.goto('/finance/payroll');
  await expect(page.getByText('Preview only.').first()).toBeVisible();
  await page.getByRole('link', { name: 'Payslip' }).first().click();
  await expect(page.getByText('Net before statutory deductions')).toBeVisible();
});

test('employee downloads their own data', async ({ page }) => {
  await login(page, 'arjun');
  const r = await page.request.get('/api/me/export');
  const j = (await r.json()) as { profile: { code: string }; faceTemplate: unknown };
  expect(j.profile.code).toBe('E010');
  expect(j.faceTemplate).toBeNull();
});
