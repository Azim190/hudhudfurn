import { expect, test, type APIRequestContext } from '@playwright/test';

/** Staff order operations. A guest COD order is placed through the storefront BFF first. */

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101';
const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:3100';
const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';

async function placeCodOrder(request: APIRequestContext): Promise<string> {
  const product = await (await request.get(`${API}/products/everyday-cotton-sheet-set-300-tc`)).json();
  const variant = product.variants.find((v: { available: boolean }) => v.available);
  const headers = { Origin: STOREFRONT };
  expect((await request.post(`${STOREFRONT}/bff/cart/items`, { data: { variantId: variant.id, quantity: 1 }, headers })).status()).toBe(201);
  const phone = `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const res = await request.post(`${STOREFRONT}/bff/checkout/orders`, {
    headers: { ...headers, 'Idempotency-Key': `e2e-admin-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    data: {
      fulfillment: 'DELIVERY',
      address: { recipientName: 'Huda Saleh', phone, cityCode: 'DMM', street: 'King Saud Street 7' },
      paymentMethod: 'COD',
      contact: { name: 'Huda Saleh', phone },
      locale: 'en',
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).order.number as string;
}

test('staff move a COD order to delivered, which issues its tax invoice', async ({ page, playwright }) => {
  const guest = await playwright.request.newContext();
  const number = await placeCodOrder(guest);
  await guest.dispose();

  await page.goto(`${ADMIN}/en/orders?q=${number}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await page.getByRole('link', { name: number }).click();
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();

  for (const status of ['Ready', 'Shipped', 'Delivered']) {
    await page.getByRole('button', { name: `Mark as ${status}` }).click();
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'XML' })).toBeVisible();
  await expect(page.getByText(/^INV-\d{4}-\d{6}$/)).toBeVisible();
});
