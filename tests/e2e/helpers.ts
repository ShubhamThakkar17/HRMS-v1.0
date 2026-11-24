import { expect, type Page } from '@playwright/test';

export async function login(page: Page, who: string) {
  await page.goto('/login');
  await page.locator('form:has-text("Sign in to demo") input[name=email]').fill(`${who}@demo.example`);
  await page.getByRole('button', { name: 'Sign in to demo' }).click();
  await expect(page).toHaveURL('/');
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function navLabels(page: Page) {
  return (await page.locator('nav a').allTextContents()).map((t) => t.replace(/\d+$/, '').trim());
}

/** IST business date n days from today, moved forward to a weekday. */
export function istWeekday(daysAhead: number) {
  const d = new Date(Date.now() + 330 * 60_000 + daysAhead * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
