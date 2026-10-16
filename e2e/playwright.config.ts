import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

/**
 * Expects the API (4100), storefront (3100) and admin (3101) to be running
 * (`pnpm dev` or the production builds). CI starts them before this suite.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // One local API serves every worker: more workers only add contention.
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    // Public storefront and admin login screens, desktop and mobile.
    { name: 'desktop', testIgnore: /admin-(catalog|orders|configurator)|.setup.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', testIgnore: /admin-(catalog|orders|configurator)|.setup.ts|storefront-shop|storefront-checkout|storefront-configurator/, use: { ...devices['Pixel 7'] } },
    // Signed-in admin flows: log in once through the UI, then reuse the session.
    { name: 'admin-setup', testMatch: /admin.setup.ts/ },
    {
      name: 'admin',
      testMatch: /admin-(catalog|orders|configurator).spec.ts/,
      dependencies: ['admin-setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: join(__dirname, '.auth', 'admin.json') },
    },
  ],
});
