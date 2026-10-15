import { expect, test, type Page } from '@playwright/test';

/**
 * Checkout against the seeded catalog with the payment simulator (PAYMENTS_SIMULATOR=true).
 * Every test is a fresh guest with its own phone number, so first-order coupons stay valid.
 */

const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';
const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:3100';
const phone = () => `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

/** Put an in-stock variant of a seeded product in this browser's guest cart. */
async function addToCart(page: Page, slug: string, quantity = 1) {
  const product = await (await page.request.get(`${API}/products/${encodeURIComponent(slug)}`)).json();
  const variant = product.variants.find((v: { available: boolean }) => v.available);
  expect(variant, `an available variant of ${slug}`).toBeTruthy();
  const res = await page.request.post(`${STOREFRONT}/bff/cart/items`, { data: { variantId: variant.id, quantity }, headers: { Origin: STOREFRONT } });
  expect(res.status()).toBe(201);
}

const section = (page: Page, heading: string) => page.getByRole('heading', { level: 2, name: heading, exact: true }).locator('xpath=..');

test('guest pays by card with a coupon and gets a ZATCA invoice (English)', async ({ page }) => {
  await addToCart(page, 'egyptian-cotton-sheet-set-600-tc');
  await page.goto('/en/cart');
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();

  const mobile = phone();
  const contact = section(page, 'Contact details');
  await contact.getByLabel('Full name').fill('Sara Ahmed');
  await contact.getByLabel('Mobile number').fill(mobile);
  await contact.getByLabel('Email').fill('sara@example.com');

  const delivery = section(page, 'Delivery');
  await delivery.getByLabel('Recipient name').fill('Sara Ahmed');
  await delivery.getByLabel('Mobile number').fill(mobile);
  await delivery.getByLabel('City').selectOption({ label: 'Jeddah' });
  await delivery.getByLabel('Street and house details').fill('Tahlia Street, villa 12');
  await delivery.getByLabel('Postal code').fill('23434');
  await expect(delivery.getByRole('radio', { name: /SMSA standard/ })).toBeChecked();

  await page.getByLabel('Coupon code').fill('welcome10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Coupon WELCOME10 applied')).toBeVisible();
  await expect(page.getByText('10% off your first order')).toBeVisible();

  await page.getByRole('radio', { name: /^Card/ }).check();
  const total = await page.getByTestId('checkout-total').textContent();
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  // Hosted payment page (simulator).
  await expect(page.getByRole('heading', { name: 'Payment simulator' })).toBeVisible();
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('Thank you! Your order has been received')).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]{36}\?placed=1/);
  await expect(page.getByTestId('order-number')).toContainText(/HD-\d{4}-\d{6}/);
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: /Tax invoice · INV-/ }).click();
  const invoice = page.getByTestId('invoice');
  await expect(invoice.getByRole('heading', { name: 'فاتورة ضريبية مبسطة' })).toBeVisible();
  await expect(invoice.getByText('Simplified tax invoice')).toBeVisible();
  await expect(page.getByTestId('seller-vat')).toHaveText('300000000000003');
  await expect(invoice.locator('svg').first()).toBeVisible();
  // The printed total equals what the customer paid.
  const paid = (total ?? '').replace(/[^\d.]/g, '');
  await expect(page.getByTestId('invoice-total')).toHaveText(`${Number(paid).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR`);
});

test('guest orders with cash on delivery (Arabic)', async ({ page }) => {
  await addToCart(page, 'cooling-bamboo-sheet-set');
  await page.goto('/ar/checkout');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'إتمام الطلب' })).toBeVisible();

  const mobile = phone();
  const contact = section(page, 'بيانات التواصل');
  await contact.getByLabel('الاسم الكامل').fill('نورة العتيبي');
  await contact.getByLabel('رقم الجوال').fill(mobile);

  const delivery = section(page, 'التوصيل');
  await delivery.getByLabel('اسم المستلم').fill('نورة العتيبي');
  await delivery.getByLabel('رقم الجوال').fill(mobile);
  await delivery.getByLabel('المدينة').selectOption({ label: 'الرياض' });
  await delivery.getByLabel('الشارع وتفاصيل المنزل').fill('شارع التحلية، فيلا 4');
  await expect(delivery.getByRole('radio', { name: /توصيل هدهد/ })).toBeChecked();

  const cod = page.getByRole('radio', { name: /الدفع عند الاستلام/ });
  await expect(cod).toBeEnabled();
  await cod.check();
  await expect(page.getByText('رسوم الدفع عند الاستلام')).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();

  await expect(page.getByText('شكراً لك! تم استلام طلبك')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('مؤكد', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('الدفع عند الاستلام', { exact: true }).first()).toBeVisible();
  // COD orders are invoiced on delivery, not before.
  await expect(page.getByRole('heading', { name: 'الفواتير الضريبية' })).toHaveCount(0);
  await expect(page).toHaveScreenshot('order-confirmed-ar.png', { mask: [page.locator('img'), page.getByTestId('order-number'), page.locator('time, p.text-ink-500, ol')] });
});

test('a declined card can be retried from the return page', async ({ page }) => {
  await addToCart(page, 'egyptian-cotton-sheet-set-600-tc');
  await page.goto('/en/checkout');
  const mobile = phone();
  const contact = section(page, 'Contact details');
  await contact.getByLabel('Full name').fill('Faisal Omar');
  await contact.getByLabel('Mobile number').fill(mobile);

  await page.getByRole('radio', { name: 'Store pickup' }).check();
  await page.getByRole('radio', { name: /Riyadh showroom/ }).check();
  await expect(page.getByText(/Ready for pickup in \d+–\d+ business days/)).toBeVisible();
  await expect(page.getByRole('radio', { name: /Cash on delivery/ })).toBeDisabled();
  await page.getByRole('radio', { name: /^Card/ }).check();
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  await page.getByRole('button', { name: 'Decline card' }).click();
  await expect(page.getByText("Your payment wasn't completed")).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByText('Thank you! Your order has been received')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Pickup from')).toBeVisible();
});
