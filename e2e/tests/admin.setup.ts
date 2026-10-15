import { expect, test as setup } from '@playwright/test';
import { authenticator } from 'otplib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101';
export const ADMIN_STATE = join(__dirname, '..', '.auth', 'admin.json');
const SECRET_FILE = join(__dirname, '..', '.auth', 'totp-secret');

/**
 * Sign in as the seeded owner through the real UI (password → TOTP), enrolling 2FA on first run.
 * The TOTP secret is kept locally (git-ignored) so later runs can generate codes.
 */
setup('staff sign-in', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? process.env.SEED_OWNER_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or SEED_OWNER_*)');

  await page.goto(`${ADMIN}/en/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const enrol = page.getByRole('heading', { name: 'Set up two-factor authentication' });
  const verify = page.getByRole('heading', { name: 'Two-factor verification' });
  await expect(enrol.or(verify)).toBeVisible();

  let secret: string;
  if (await enrol.isVisible()) {
    secret = (await page.locator('code').first().innerText()).trim();
    mkdirSync(dirname(SECRET_FILE), { recursive: true });
    writeFileSync(SECRET_FILE, secret);
  } else {
    if (!existsSync(SECRET_FILE)) throw new Error('2FA already enrolled for this account but no local secret; reset the account 2FA');
    secret = readFileSync(SECRET_FILE, 'utf8').trim();
  }
  const codesTitle = page.getByRole('heading', { name: 'Recovery codes' });
  const welcome = page.getByRole('heading', { name: /Welcome/ });
  const rejected = page.getByRole('main').getByRole('alert').or(page.locator('.bg-danger-50[role="alert"]'));

  await page.getByLabel('Verification code 1').fill(authenticator.generate(secret));
  await expect(codesTitle.or(welcome).or(rejected)).toBeVisible({ timeout: 15_000 });
  if (await rejected.isVisible()) {
    // The server refuses a code from an already-used 30 s step (replay protection): wait for the next step.
    await page.waitForTimeout(authenticator.timeRemaining() * 1000 + 500);
    await page.getByLabel('Verification code 1').fill(authenticator.generate(secret));
  }
  await expect(codesTitle.or(welcome)).toBeVisible({ timeout: 15_000 });
  if (await codesTitle.isVisible()) await page.getByRole('button', { name: "I've saved these codes, continue" }).click();
  await expect(welcome).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});
