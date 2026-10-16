import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { ADMIN, AUTH_DIR } from './staff-auth';

/**
 * Home measurement visits end to end: the customer books and pays the visit fee, the office assigns
 * the seeded technician, the technician measures (with a photo), collects a signature and sends a
 * quotation, and the customer approves and pays it online with the visit fee credited.
 * Customer sign-in reads the OTP from the API's development SMS outbox (SMS_PROVIDER=console).
 */

const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';
const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:3100';
const phone = () => `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

async function outbox(request: APIRequestContext, to: string, match: RegExp) {
  let found: string | undefined;
  await expect
    .poll(async () => {
      const items = (await (await request.get(`${API}/dev/sms?to=${to}`)).json()) as Array<{ body: string }>;
      found = items.find((i) => match.test(i.body))?.body;
      return Boolean(found);
    }, { timeout: 15_000 })
    .toBe(true);
  return found!;
}

/** Sign a new customer in through the BFF (cookies land in this browser context). */
async function customerSignIn(page: Page, mobile: string) {
  const headers = { Origin: STOREFRONT };
  expect((await page.request.post(`${STOREFRONT}/bff/auth/otp/request`, { data: { phone: mobile }, headers })).ok()).toBe(true);
  const sms = await outbox(page.request, mobile, /\d{4,6}/);
  const code = sms.match(/\b(\d{4,6})\b/)![1];
  expect((await page.request.post(`${STOREFRONT}/bff/auth/otp/verify`, { data: { phone: mobile, code }, headers })).ok()).toBe(true);
}

async function fillAddress(page: Page, l: { name: string; mobile: string; city: string; street: string; labels: { recipient: string; phone: string; city: string; street: string } }) {
  await page.getByLabel(l.labels.recipient).fill(l.name);
  await page.getByLabel(l.labels.phone).fill(l.mobile);
  await page.getByLabel(l.labels.city, { exact: true }).selectOption({ label: l.city });
  await page.getByLabel(l.labels.street).fill(l.street);
}

/** Choose the first free time, optionally a few days ahead (changes close 24 h before a visit). */
async function pickSlot(page: Page, labels: { day: string; time: string }, daysAhead = 0) {
  if (daysAhead) await page.getByRole('radiogroup', { name: labels.day }).getByRole('radio').and(page.locator(':enabled')).nth(daysAhead).click();
  const slot = page.getByRole('radiogroup', { name: labels.time }).getByRole('radio').and(page.locator(':enabled')).first();
  await slot.click();
  await expect(slot).toHaveAttribute('aria-checked', 'true');
}

async function paySimulator(page: Page, ar = false) {
  await expect(page.getByRole('heading', { name: ar ? 'محاكي الدفع' : 'Payment simulator' })).toBeVisible();
  await page.getByRole('button', { name: ar ? 'ادفع الآن' : 'Pay now' }).click();
}

/** A small valid PNG (solid colour), standing in for a camera photo of the window. */
function png(width = 48, height = 32) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const staff = (browser: Browser, who: 'admin' | 'technician') => browser.newContext({ storageState: join(AUTH_DIR, `${who}.json`), viewport: who === 'technician' ? { width: 412, height: 915 } : { width: 1440, height: 900 } });

test('measurement visit → technician quotation → customer pays (English)', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const mobile = phone();
  await customerSignIn(page, mobile);

  // 1. Customer books a paid measurement visit in Riyadh.
  await page.goto('/en/services/book');
  await expect(page.getByRole('heading', { level: 1, name: 'Book a measurement visit' })).toBeVisible();
  await fillAddress(page, { name: 'Sara Ahmed', mobile, city: 'Riyadh', street: 'King Fahd Road, villa 7', labels: { recipient: 'Recipient name', phone: 'Mobile number', city: 'City', street: 'Street and house details' } });
  await expect(page.getByTestId('visit-fee')).toHaveText(/50/);
  await pickSlot(page, { day: 'Day', time: 'Time' });
  await page.getByLabel('Notes for the technician (optional)').fill('Three windows in the living room');
  await page.getByRole('button', { name: 'Book and pay' }).click();
  await paySimulator(page);
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.getByRole('link', { name: /Visit booking BK-\d{4}-\d{6}/ }).click();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  const bookingId = page.url().match(/bookings\/([0-9a-f-]{36})/)![1]!;
  const bookingNumber = (await page.getByTestId('booking-number').innerText()).match(/BK-\d{4}-\d{6}/)![0];
  await outbox(page.request, mobile, new RegExp(`${bookingNumber} is confirmed`));

  // 2. The office assigns the technician.
  const office = await (await staff(browser, 'admin')).newPage();
  await office.goto(`${ADMIN}/en/services/bookings/${bookingId}`);
  await office.getByLabel('Technician', { exact: true }).selectOption({ label: 'Field Technician' });
  await office.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(office.getByText('Technician assigned', { exact: true }).first()).toBeVisible();
  await outbox(page.request, mobile, /technician has been assigned/);

  // 3. The technician runs the visit on a phone-sized screen.
  const tech = await (await staff(browser, 'technician')).newPage();
  await tech.goto(`${ADMIN}/en/technician/${bookingId}`);
  await expect(tech.getByRole('heading', { level: 1, name: bookingNumber })).toBeVisible();
  await expect(tech.getByRole('link', { name: 'Navigate' })).toHaveAttribute('href', /google\.com\/maps/);
  await tech.getByRole('button', { name: 'On my way' }).click();
  await expect(tech.getByText('Technician on the way', { exact: true })).toBeVisible();
  await tech.getByRole('button', { name: 'Start visit' }).click();
  await expect(tech.getByText('In progress', { exact: true })).toBeVisible();

  await tech.getByLabel('Room / window').fill('Living room — left');
  await tech.getByLabel('Width (cm)').fill('240');
  await tech.getByLabel('Height (cm)').fill('260');
  await tech.getByLabel('Photos').setInputFiles({ name: 'window.png', mimeType: 'image/png', buffer: png() });
  await expect(tech.locator('img[src^="blob:"]')).toHaveCount(1);
  await tech.getByRole('button', { name: 'Save window' }).click();
  await expect(tech.getByText('240 × 260 cm · Wall')).toBeVisible();
  await expect(tech.getByText('1 photos')).toBeVisible();

  const pad = tech.getByLabel('Customer signature', { exact: true });
  const box = (await pad.boundingBox())!;
  await tech.mouse.move(box.x + 30, box.y + box.height / 2);
  await tech.mouse.down();
  for (let i = 1; i <= 12; i++) await tech.mouse.move(box.x + 30 + i * 20, box.y + box.height / 2 + (i % 2 ? -25 : 25));
  await tech.mouse.up();
  await tech.getByRole('button', { name: 'Save signature' }).click();
  await expect(tech.getByText('Signed by the customer')).toBeVisible();

  await tech.getByRole('button', { name: 'Send quotation to customer' }).click();
  await expect(tech.getByText(/QT-\d{4}-\d{6}/)).toBeVisible();
  await expect(tech.getByText(/Awaiting your approval/)).toBeVisible();
  await tech.getByRole('button', { name: 'Complete visit' }).click();
  await expect(tech.getByText('Completed', { exact: true })).toBeVisible();

  // 4. The customer opens the link from the SMS, sees the visit-fee credit and pays.
  const sms = await outbox(page.request, mobile, /QT-\d{4}-\d{6}/);
  const link = sms.match(/https?:\/\/\S+\/quotations\/QT-\d{4}-\d{6}/)![0];
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: /QT-\d{4}-\d{6}/ })).toBeVisible();
  await expect(page.getByText('Measurement visit fee credit')).toBeVisible();
  await expect(page.getByText('Living room — left')).toBeVisible();
  await page.getByRole('button', { name: 'Approve and pay' }).click();
  await paySimulator(page);
  await expect(page.getByText('Thank you! Your order has been received')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  await office.context().close();
  await tech.context().close();
});

test('book, reschedule and cancel a visit with a refund (Arabic)', async ({ page }) => {
  test.setTimeout(90_000);
  const mobile = phone();
  await customerSignIn(page, mobile);

  await page.goto('/ar/services/book');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'احجزي زيارة قياس' })).toBeVisible();
  await fillAddress(page, { name: 'نورة العتيبي', mobile, city: 'الدمام', street: 'شارع الأمير محمد، فيلا ٣', labels: { recipient: 'اسم المستلم', phone: 'رقم الجوال', city: 'المدينة', street: 'الشارع وتفاصيل المنزل' } });
  await pickSlot(page, { day: 'اليوم', time: 'الوقت' }, 3);
  await page.getByRole('button', { name: 'احجزي وادفعي' }).click();
  await paySimulator(page, true);
  await expect(page).toHaveURL(/\/ar\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.getByRole('link', { name: /حجز الزيارة BK-/ }).click();
  await expect(page.getByText('مؤكدة', { exact: true })).toBeVisible();
  const when = page.getByText('الموعد', { exact: true }).locator('xpath=..');
  const before = await when.innerText();

  // Move to another free time.
  await page.getByRole('button', { name: 'تغيير الموعد' }).click();
  const free = page.locator('[role="radio"]:enabled');
  await free.last().click();
  await page.getByRole('button', { name: 'تأكيد الموعد الجديد' }).click();
  await expect(when).not.toHaveText(before);

  // Cancel: the visit fee is refunded through the payment provider and a credit note is issued.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'إلغاء الزيارة' }).click();
  await expect(page.getByText('ملغاة', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إلغاء الزيارة' })).toHaveCount(0);

  await page.goto('/ar/account/bookings');
  await expect(page.getByRole('heading', { level: 1, name: 'زياراتي' })).toBeVisible();
  await expect(page.getByText('ملغاة').first()).toBeVisible();
});

test('the home visit form explains coverage and asks guests to sign in (English)', async ({ page }) => {
  await page.goto('/en/services/book');
  await expect(page.getByText('Choose the city first to see available times.')).toBeVisible();
  await page.getByLabel('City', { exact: true }).selectOption({ label: 'Riyadh' });
  await expect(page.getByRole('radiogroup', { name: 'Day' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to book' })).toHaveAttribute('href', /\/en\/login\?next=%2Fservices%2Fbook/);
  // A city outside the service areas.
  await page.getByLabel('City', { exact: true }).selectOption({ label: 'Tabuk' });
  await expect(page.getByText("We don't offer home visits in this area yet.")).toBeVisible();
});
