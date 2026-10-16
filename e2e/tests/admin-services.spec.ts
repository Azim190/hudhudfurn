import { expect, test } from '@playwright/test';
import { ADMIN } from './staff-auth';

/** Office tools for home visits, signed in as the seeded owner. */

test('service areas: generate slots idempotently and close a slot (Arabic)', async ({ page }) => {
  await page.goto(`${ADMIN}/ar/services/areas`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'مناطق الخدمة' })).toBeVisible();
  await expect(page.getByRole('row', { name: /الرياض/ }).first()).toContainText('قياس، تركيب');

  // The seed already created these slots, so a second run only reports what already exists.
  await page.getByRole('button', { name: 'إنشاء المواعيد' }).click();
  await expect(page.getByText(/تم إنشاء \d+ موعد، و\d+ موجودة مسبقاً/)).toBeVisible();

  const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'إغلاق' }) }).last();
  await expect(row).toBeVisible();
  const time = await row.locator('td').nth(1).innerText();
  const day = await row.locator('td').first().innerText();
  const same = page.locator('tbody tr').filter({ hasText: day }).filter({ hasText: time });
  await row.getByRole('button', { name: 'إغلاق' }).click();
  await expect(same.getByRole('button', { name: 'فتح' })).toBeVisible();
  await same.getByRole('button', { name: 'فتح' }).click();
  await expect(same.getByRole('button', { name: 'إغلاق' })).toBeVisible();
});

test('visits list filters by status and links to the technicians screen (English)', async ({ page }) => {
  await page.goto(`${ADMIN}/en/services/bookings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Visits' })).toBeVisible();
  await page.getByLabel('Status').selectOption({ label: 'Confirmed' });
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/status=CONFIRMED/);
  await page.getByRole('link', { name: 'Technicians' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Technicians' })).toBeVisible();
  await expect(page.getByText('Field Technician').first()).toBeVisible();
});
