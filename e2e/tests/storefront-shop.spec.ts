import { expect, test, type Page } from '@playwright/test';

/** Shopping flows against the seeded sample catalog (`seed:catalog`). Each test gets a fresh guest. */

const main = (page: Page) => page.getByRole('main');

test('category page filters by colour, sorts and shows shareable URLs', async ({ page }) => {
  await page.goto('/en/c/abayas');
  await expect(page.getByRole('heading', { level: 1, name: 'Abayas' })).toBeVisible();
  const results = page.getByRole('status').filter({ hasText: /products$/ });
  await expect(results).toHaveText('12 products');

  await page.getByRole('button', { name: /^Burgundy \(\d+\)$/ }).first().click();
  await expect(page).toHaveURL(/f\.color=burgundy/);
  await expect(results).toHaveText('3 products');

  await page.getByLabel('Sort by').selectOption('price_asc');
  await expect(page).toHaveURL(/sort=price_asc/);
  const prices = await main(page).locator('article').evaluateAll((cards) => cards.length);
  expect(prices).toBe(3);

  // The filtered URL is server-rendered: reloading keeps the state.
  await page.reload();
  await expect(results).toHaveText('3 products');
  await expect(page.getByRole('button', { name: /^Burgundy/ }).first()).toHaveAttribute('aria-pressed', 'true');
});

test('Arabic category page renders RTL with mirrored layout', async ({ page }) => {
  await page.goto('/ar/c/abayas');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'العبايات' })).toBeVisible();
  await expect(page).toHaveScreenshot('category-ar.png', { mask: [page.locator('picture')] });
});

test('product page: choose options, add to cart, update quantity and gift wrap', async ({ page }) => {
  await page.goto('/en/c/abayas');
  await main(page).getByRole('link', { name: 'Classic Closed Crepe Abaya' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Classic Closed Crepe Abaya' })).toBeVisible();
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(jsonLd.some((s) => JSON.parse(s)['@type'] === 'Product')).toBe(true);

  await page.getByRole('button', { name: 'Navy', exact: true }).click();
  await page.getByRole('button', { name: '56"', exact: true }).click();
  await page.getByRole('button', { name: 'L', exact: true }).click();
  await page.getByLabel('Gift wrap').check();
  await page.getByLabel('Gift message (optional)').fill('Eid Mubarak');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(main(page).getByRole('status')).toContainText('Added to your cart');
  await expect(page.getByRole('link', { name: 'Cart (1)' })).toBeVisible();

  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping cart' })).toBeVisible();
  const line = main(page).locator('li').filter({ hasText: 'Classic Closed Crepe Abaya' });
  await expect(line).toContainText('Colour: Navy');
  await expect(page.getByLabel('Gift message (optional)')).toHaveValue('Eid Mubarak');
  await expect(main(page).getByText('Gift wrapping')).toBeVisible();

  await line.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(line.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart (2)' })).toBeVisible();
  await expect(page.getByText(/Includes VAT \(15%\)/)).toBeVisible();
  await expect(page).toHaveScreenshot('cart-en.png', { mask: [page.locator('img')] });

  await line.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('blinds are priced by the entered size', async ({ page }) => {
  await page.goto('/en/search?q=roller%20blind');
  await main(page).getByRole('link', { name: 'Blackout Roller Blind' }).click();
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  await page.getByLabel('Width (cm)').fill('120');
  await page.getByLabel('Height (cm)').fill('150');
  // 159 SAR/m² × 1.8 m² = 286.20 SAR
  await expect(main(page).getByText('SAR 286.20').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(main(page).getByText('Size: 120 × 150 cm')).toBeVisible();
});

test('search suggestions work with the keyboard', async ({ page }) => {
  await page.goto('/ar');
  const box = page.getByRole('combobox').first();
  await box.fill('مخمل');
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.first()).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/\/ar\/search\?q=/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('مخمل');
  await expect(main(page).locator('article').first()).toBeVisible();
});

// The two sample sheet sets, isolated by material: newer bedding products would push them off page 1.
const SAMPLE_SHEET_SETS = '/en/c/bedding?f.bedding_material=egyptian_cotton,bamboo';

test('guest wishlist and compare persist on the device', async ({ page }) => {
  await page.goto(SAMPLE_SHEET_SETS);
  await main(page).getByRole('button', { name: /^Add to wishlist: Egyptian Cotton Sheet Set/ }).click();
  await expect(page.getByRole('link', { name: 'Wishlist (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Wishlist (1)' }).click();
  await expect(main(page).getByRole('link', { name: /Egyptian Cotton Sheet Set/ })).toBeVisible();

  for (const name of ['Egyptian Cotton Sheet Set, 600 TC', 'Cooling Bamboo Sheet Set']) {
    await page.goto(SAMPLE_SHEET_SETS);
    await main(page).getByRole('link', { name }).click();
    await page.getByRole('button', { name: 'Add to compare' }).click();
  }
  await page.getByRole('link', { name: 'Compare (2)' }).click();
  const table = main(page).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveCount(3);
  await expect(table.getByRole('rowheader', { name: 'Material' })).toBeVisible();
});

test('mobile menu opens the category drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar');
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  const drawer = page.getByRole('dialog', { name: 'القائمة' });
  await drawer.getByRole('button', { name: 'العبايات' }).click();
  await drawer.getByRole('link', { name: 'عبايات يومية' }).click();
  await expect(page).toHaveURL(/\/ar\/c\//);
  await expect(page.getByRole('heading', { level: 1, name: 'عبايات يومية' })).toBeVisible();
});

test('Arabic product page snapshot', async ({ page }) => {
  await page.goto('/ar/c/abayas');
  await main(page).getByRole('link', { name: 'عباية كريب مقفلة كلاسيكية' }).click();
  await expect(page.getByRole('button', { name: 'أضيفي إلى السلة' })).toBeVisible();
  await expect(page).toHaveScreenshot('product-ar.png', { mask: [page.locator('picture'), page.locator('section[aria-labelledby="recent"]')] });
});
