import { test as setup } from '@playwright/test';
import { join } from 'node:path';
import { AUTH_DIR, staffSignIn } from './staff-auth';

export const ADMIN_STATE = join(AUTH_DIR, 'admin.json');

/** Sign in as the seeded owner; later admin projects reuse the saved session. */
setup('staff sign-in', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? process.env.SEED_OWNER_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or SEED_OWNER_*)');
  await staffSignIn(page, { email, password, secretFile: join(AUTH_DIR, 'totp-secret'), statePath: ADMIN_STATE, landed: (p) => p.getByRole('heading', { name: /Welcome/ }) });
});
