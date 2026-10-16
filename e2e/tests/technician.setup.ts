import { test as setup } from '@playwright/test';
import { join } from 'node:path';
import { AUTH_DIR, staffSignIn } from './staff-auth';

/** Sign in as the seeded field technician (SEED_TECHNICIAN_*), who lands on the job list. */
setup('technician sign-in', async ({ page }) => {
  const email = process.env.E2E_TECHNICIAN_EMAIL ?? process.env.SEED_TECHNICIAN_EMAIL;
  const password = process.env.E2E_TECHNICIAN_PASSWORD ?? process.env.SEED_TECHNICIAN_PASSWORD;
  if (!email || !password) throw new Error('Set E2E_TECHNICIAN_EMAIL / E2E_TECHNICIAN_PASSWORD (or SEED_TECHNICIAN_*)');
  await staffSignIn(page, { email, password, secretFile: join(AUTH_DIR, 'technician-totp-secret'), statePath: join(AUTH_DIR, 'technician.json'), landed: (p) => p.getByRole('heading', { level: 1, name: 'My jobs' }) });
});
