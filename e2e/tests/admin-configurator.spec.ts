import { expect, test } from '@playwright/test';

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101/admin';

test('staff open a configurator template and simulate a quote', async ({ page }) => {
  await page.goto(`${ADMIN}/en/configurator`);
  await expect(page.getByRole('heading', { level: 1, name: 'Configurators' })).toBeVisible();
  await page.getByRole('link', { name: 'Made-to-measure curtains' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Made-to-measure curtains');
  await expect(page.getByRole('heading', { name: 'Heading styles' })).toBeVisible();
  await expect(page.getByLabel('WAVE makingCost', { exact: false }).or(page.getByLabel('WAVE Making cost / m (SAR)'))).toHaveValue('35');

  await page.getByLabel('Fabric / base price (SAR)').fill('89');
  await page.getByRole('button', { name: 'Calculate' }).click();
  const sim = page.getByTestId('simulation');
  await expect(sim).toContainText('Wave making');
  await expect(sim).toContainText('"widths": 6');
});
