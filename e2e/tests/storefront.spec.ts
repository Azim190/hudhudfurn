import { expect, test } from '@playwright/test';

const LOCALES = [
  { locale: 'ar', dir: 'rtl', hero: 'أناقة بيتك تبدأ من هنا', switchTo: 'تغيير اللغة إلى الإنجليزية', phoneError: 'أدخل رقم جوال سعودي صحيح يبدأ بـ 05' },
  { locale: 'en', dir: 'ltr', hero: 'A more beautiful home starts here', switchTo: 'Switch language to Arabic', phoneError: 'Enter a valid Saudi mobile number starting with 05' },
] as const;

for (const l of LOCALES) {
  test.describe(`storefront (${l.locale})`, () => {
    test('home renders with the correct direction and mirrored icons', async ({ page }) => {
      await page.goto(`/${l.locale}`);
      await expect(page.locator('html')).toHaveAttribute('dir', l.dir);
      await expect(page.locator('html')).toHaveAttribute('lang', l.locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(l.hero);

      // "Forward" chevrons must point in the reading direction: flipped in RTL only.
      // Tailwind v4 mirrors with the CSS `scale` property rather than `transform`.
      const scale = await page
        .getByRole('link', { name: /تسوّق الآن|Shop now/ })
        .locator('svg')
        .evaluate((el) => getComputedStyle(el).scale);
      if (l.dir === 'rtl') expect(scale).toMatch(/^-1/);
      else expect(['none', '1', '1 1']).toContain(scale);

      await expect(page).toHaveScreenshot(`home-${l.locale}.png`, { fullPage: true });
    });

    test('language switcher keeps the current page', async ({ page }) => {
      await page.goto(`/${l.locale}/login`);
      await page.getByRole('button', { name: l.switchTo, exact: true }).click();
      const other = l.locale === 'ar' ? 'en' : 'ar';
      await expect(page).toHaveURL(new RegExp(`/${other}/login$`));
      await expect(page.locator('html')).toHaveAttribute('dir', other === 'ar' ? 'rtl' : 'ltr');
    });

    test('login validates Saudi numbers with a localized message', async ({ page }) => {
      await page.goto(`/${l.locale}/login`);
      const phone = page.getByLabel(l.locale === 'ar' ? 'رقم الجوال' : 'Mobile number');
      await expect(phone).toHaveAttribute('dir', 'ltr');
      await phone.fill('0112345678');
      await page.getByRole('button', { name: l.locale === 'ar' ? 'إرسال الرمز' : 'Send code' }).click();
      // Scope to <main>: Next.js adds its own role=alert route announcer.
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(l.phoneError);
      await expect(page).toHaveScreenshot(`login-error-${l.locale}.png`);
    });

    test('first Tab focuses the skip link', async ({ page }) => {
      await page.goto(`/${l.locale}`);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: l.locale === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content' })).toBeFocused();
    });
  });
}

test('root redirects to Arabic by default', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ar$/);
});
