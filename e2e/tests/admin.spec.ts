import { expect, test } from '@playwright/test';

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101';

for (const locale of ['ar', 'en'] as const) {
  test.describe(`admin (${locale})`, () => {
    test('unauthenticated visitors land on the staff login', async ({ page }) => {
      await page.goto(`${ADMIN}/${locale}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page).toHaveScreenshot(`admin-login-${locale}.png`);
    });

    test('wrong credentials show a localized error', async ({ page }) => {
      await page.goto(`${ADMIN}/${locale}/login`);
      await page.getByLabel(locale === 'ar' ? 'البريد الإلكتروني' : 'Email').fill(`nobody-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
      await page.getByLabel(locale === 'ar' ? 'كلمة المرور' : 'Password').fill('definitely-wrong');
      await page.getByRole('button', { name: locale === 'ar' ? 'دخول' : 'Sign in' }).click();
      await expect(page.locator('form').getByRole('alert')).toHaveText(
        locale === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : 'Incorrect email or password',
      );
    });
  });
}
