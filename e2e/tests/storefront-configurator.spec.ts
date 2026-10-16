import { expect, test, type Page } from '@playwright/test';

/** Made-to-measure configurators on the seeded catalog (curtains, abayas, sofa covers). */

const main = (page: Page) => page.getByRole('main');
// A tiny valid PNG (1×1) for the photo upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('Arabic: configure a wave curtain, see the live price and add it to the cart', async ({ page }) => {
  await page.goto(`/ar/p/${encodeURIComponent('made-to-measure-wave-blackout-curtain')}`);
  const cfg = page.getByTestId('configurator');
  await expect(cfg).toBeVisible();
  await expect(cfg.getByText('أدخلي المقاسات لعرض السعر.')).toBeVisible();

  await cfg.getByLabel('العرض (سم)').fill('20');
  await cfg.getByLabel('العرض (سم)').blur();
  await expect(cfg.getByText('أدخلي قيمة بين 30 و 1200 سم')).toBeVisible();
  await cfg.getByLabel('العرض (سم)').fill('300');
  await cfg.getByLabel('الارتفاع (سم)').fill('260');
  await cfg.getByRole('radio', { name: /بطانة معتمة/ }).click();

  // 2 × 2 widths of 2.8 m fabric × 2.9 m cut = 11.6 m at 89 SAR + wave making + blackout lining.
  await expect(cfg.getByText('11.6 م').first()).toBeVisible();
  const price = cfg.getByTestId('configured-price');
  await expect(price).toContainText('1,596.80');
  await expect(cfg.getByRole('img', { name: 'رسم توضيحي للستارة بالقماش المختار' })).toBeVisible();

  await cfg.getByRole('button', { name: 'أضيفي إلى السلة' }).click();
  await expect(cfg.getByRole('status').or(cfg.getByText('تمت الإضافة إلى سلتك'))).toBeVisible();
  await page.goto('/ar/cart');
  const summary = main(page).getByTestId('configuration-summary');
  await expect(summary).toContainText('300 × 260 سم');
  await expect(summary).toContainText('بطانة معتمة (بلاك أوت)');
  await expect(main(page).getByText('1,596.80').first()).toBeVisible();

  // Made to measure: cash on delivery is not offered at checkout.
  await page.goto('/ar/checkout');
  await page.getByLabel('المدينة').selectOption({ label: 'الرياض' });
  await expect(page.getByRole('radio', { name: /الدفع عند الاستلام/ })).toBeDisabled();
  await expect(page.getByText('غير متاح للمنتجات المفصّلة حسب المقاس')).toBeVisible();
});

test('English: tailor an abaya to custom measurements', async ({ page }) => {
  await page.goto('/en/p/classic-closed-crepe-abaya');
  await page.getByRole('radio', { name: 'Tailor to my measurements' }).click();
  const cfg = page.getByTestId('configurator');
  await cfg.getByLabel('Abaya length (cm)').fill('145');
  await cfg.getByLabel('Chest (cm)').fill('100');
  await cfg.getByLabel('Shoulder width (cm)').fill('40');
  await cfg.getByLabel('Sleeve length (cm)').fill('60');
  await cfg.getByLabel('Matching tarha').check();
  // 299 + 50 tailoring + 49 tarha
  await expect(cfg.getByTestId('configured-price')).toHaveText('SAR 398');
  await cfg.getByRole('button', { name: 'Add to cart' }).click();
  await expect(cfg.getByText('Added to your cart')).toBeVisible();
  await page.goto('/en/cart');
  await expect(main(page).getByTestId('configuration-summary')).toContainText('Length 145 · chest 100 · shoulder 40 · sleeve 60 cm');
});

test('English: order a tailored sofa cover with photos', async ({ page }) => {
  await page.goto('/en/p/made-to-measure-tailored-sofa-cover');
  const cfg = page.getByTestId('configurator');
  await cfg.getByLabel('Piece').selectOption({ label: 'Three-seater — SAR 450' });
  await cfg.getByLabel('Width (cm)').fill('220');
  await cfg.getByLabel('Depth (cm)').fill('90');
  await cfg.getByLabel('Height (cm)').fill('85');
  await cfg.getByRole('button', { name: 'Add to cart' }).click();
  await expect(cfg.getByText('Add at least 1')).toBeVisible();

  await cfg.getByLabel('Add photos').setInputFiles({ name: 'sofa.png', mimeType: 'image/png', buffer: PNG });
  await expect(cfg.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  // Below the advertised starting price, the minimum applies.
  await expect(cfg.getByTestId('configured-price')).toHaveText('SAR 599');
  await cfg.getByRole('button', { name: 'Add to cart' }).click();
  await expect(cfg.getByText('Added to your cart')).toBeVisible();
  await page.goto('/en/cart');
  await expect(main(page).getByTestId('configuration-summary')).toContainText('1 pieces');
});
