import { expect, test } from '@playwright/test';
import sharp from 'sharp';

/**
 * Admin catalog flows against the seeded sample catalog. Runs serially in one browser context
 * because the steps share a product created through the UI.
 */
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101/admin';
test.describe.configure({ mode: 'serial' });

/** Remove products created by earlier (possibly failed) runs, through the admin BFF. */
async function deleteTestProducts(request: import('@playwright/test').APIRequestContext) {
  const res = await request.get(`${ADMIN}/bff/admin/products?q=E2E%20Test&limit=100`);
  if (!res.ok()) return;
  const { items } = (await res.json()) as { items: Array<{ id: string; nameEn: string }> };
  for (const p of items.filter((x) => x.nameEn === 'E2E Test Abaya' || x.nameEn === 'E2E Test Abaya With Photos')) {
    await request.delete(`${ADMIN}/bff/admin/products/${p.id}`, { headers: { Origin: new URL(ADMIN).origin } });
  }
}

test.beforeAll(async ({ request }) => deleteTestProducts(request));
test.afterAll(async ({ request }) => deleteTestProducts(request));

test('product list shows the catalog and filters by search', async ({ page }) => {
  await page.goto(`${ADMIN}/en/catalog/products`);
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(26); // header + 25 per page
  await page.getByLabel('Search by name or SKU').fill('Abaya');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/q=Abaya/);
  const names = await page.locator('tbody tr').allInnerTexts();
  expect(names.length).toBeGreaterThan(5);
  expect(names.every((n) => /abaya/i.test(n))).toBe(true);
});

test('creates a draft product and edits it in both languages', async ({ page }) => {
  await page.goto(`${ADMIN}/en/catalog/products/new`);
  await page.getByLabel('Category').selectOption({ label: '— Everyday abayas' });
  await page.getByLabel('Name (Arabic)').fill('عباية اختبار تلقائي');
  await page.getByLabel('Name (English)').fill('E2E Test Abaya');
  await page.getByLabel(/Base price/).fill('245');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'E2E Test Abaya' })).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await expect(page.getByText('Arabic completeness')).toBeVisible();

  // Side-by-side bilingual editor: Arabic column is RTL, English column is LTR.
  const arabic = page.locator('div[lang="ar"][dir="rtl"]').filter({ has: page.getByRole('heading', { name: 'Arabic', exact: true }) });
  const english = page.locator('div[lang="en"][dir="ltr"]').filter({ has: page.getByRole('heading', { name: 'English', exact: true }) });
  await expect(arabic).toBeVisible();
  await expect(english).toBeVisible();
  await arabic.getByLabel('Description', { exact: true }).fill('عباية مقفلة من الكريب بقصة مستقيمة مريحة وأكمام واسعة للاستخدام اليومي.');
  await english.getByLabel('Description', { exact: true }).fill('A closed crepe abaya with a relaxed straight cut and wide sleeves for every day.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved');

  // Publishing is blocked until there is an image; the reason is listed in plain language.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('At least one image');

  // Variants: generate black + navy.
  await page.getByRole('tab', { name: 'Variants & stock' }).click();
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Navy', exact: true }).click();
  await page.getByRole('button', { name: '54"', exact: true }).click();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Generate variants' }).click();
  await expect(page.locator('tbody tr').filter({ hasText: /ABY-\d+-(BLACK|NAVY)-54-M/ })).toHaveCount(2);

  // Stock edit on the first variant.
  const stock = page.getByLabel(/^Stock ABY-\d+-BLACK-54-M$/);
  await stock.fill('6');
  await page.getByRole('button', { name: 'Update' }).first().click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved');

  // Media: upload a generated image, then publish.
  await page.getByRole('tab', { name: 'Images' }).click();
  const png = await sharp({ create: { width: 600, height: 750, channels: 3, background: '#151515' } }).png().toBuffer();
  await page.locator('#media-upload').setInputFiles({ name: 'abaya.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('ul img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();

  await expect(page).toHaveScreenshot('admin-product-editor-en.png', { mask: [page.locator('img'), page.locator('[dir="ltr"] >> text=/ABY-/')] });

  // Clean up: delete (soft) the test product.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/en\/catalog\/products$/);
});

test('adds images while creating a product', async ({ page }) => {
  await page.goto(`${ADMIN}/en/catalog/products/new`);
  await page.getByLabel('Category').selectOption({ label: '— Everyday abayas' });
  await page.getByLabel('Name (Arabic)').fill('عباية اختبار مع صور');
  await page.getByLabel('Name (English)').fill('E2E Test Abaya With Photos');
  await page.getByLabel(/Base price/).fill('199');

  const png = (bg: string) => sharp({ create: { width: 600, height: 750, channels: 3, background: bg } }).png().toBuffer();
  await page.locator('#new-product-images').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: await png('#151515') },
    { name: 'back.png', mimeType: 'image/png', buffer: await png('#1F3A5F') },
    { name: 'extra.png', mimeType: 'image/png', buffer: await png('#C9A227') },
  ]);
  // Previews before upload; one is removed again.
  await expect(page.locator('form ul img')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove' }).last().click();
  await expect(page.locator('form ul img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'E2E Test Abaya With Photos' })).toBeVisible();
  await page.getByRole('tab', { name: 'Images' }).click();
  await expect(page.locator('ul img')).toHaveCount(2);
  await expect(page.getByLabel('Alt text (Arabic)').first()).toHaveValue('عباية اختبار مع صور');
});

test('Arabic product editor mirrors the layout', async ({ page }) => {
  await page.goto(`${ADMIN}/ar/catalog/products?q=ABY-0001`);
  await page.locator('tbody a').first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('tab', { name: 'المحتوى' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveScreenshot('admin-product-editor-ar.png', { mask: [page.locator('img')] });
});

test('admin edits reach the cached storefront page within seconds (on-demand revalidation)', async ({ page, request }) => {
  const STORE = process.env.STOREFRONT_URL ?? 'http://localhost:3100';
  const slug = 'magnetic-curtain-tie-backs-pair';
  await request.get(`${STORE}/en/p/${slug}`); // make sure the page is cached
  const list = await request.get(`${ADMIN}/bff/admin/products?q=Magnetic`);
  const { items } = (await list.json()) as { items: Array<{ id: string; nameEn: string }> };
  const product = items.find((p) => p.nameEn.startsWith('Magnetic Curtain Tie-Backs'))!;
  const patch = (nameEn: string) => request.patch(`${ADMIN}/bff/admin/products/${product.id}`, { data: { nameEn }, headers: { Origin: new URL(ADMIN).origin } });
  try {
    expect((await patch('Magnetic Curtain Tie-Backs (pair) – Edited')).ok()).toBe(true);
    await expect
      .poll(async () => (await (await request.get(`${STORE}/en/p/${slug}`)).text()).includes('Tie-Backs (pair) – Edited'), { timeout: 20_000 })
      .toBe(true);
  } finally {
    await patch('Magnetic Curtain Tie-Backs (pair)');
  }
});

test('categories and attributes screens', async ({ page }) => {
  await page.goto(`${ADMIN}/en/catalog/categories`);
  await expect(page.getByRole('button', { name: /Abayas\s+12 products/ })).toBeVisible();
  await page.getByRole('button', { name: /Abayas\s+12 products/ }).click();
  await expect(page.getByLabel('Name (Arabic)')).toHaveValue('العبايات');
  await expect(page.getByRole('checkbox', { name: 'Colour Variant axis' })).toBeChecked();

  await page.goto(`${ADMIN}/en/catalog/attributes`);
  await page.getByRole('button', { name: /^Colour\s*color/ }).click();
  await expect(page.getByLabel('Arabic label black')).toHaveValue('أسود');
});
