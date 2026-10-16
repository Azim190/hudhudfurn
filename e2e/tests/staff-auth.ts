import { expect, type Locator, type Page } from '@playwright/test';
import { authenticator } from 'otplib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101';
export const AUTH_DIR = join(__dirname, '..', '.auth');

/**
 * Sign a staff member in through the real UI (password → TOTP), enrolling 2FA on first run.
 * The TOTP secret is kept locally (git-ignored) so later runs can generate codes.
 */
export async function staffSignIn(page: Page, opts: { email: string; password: string; secretFile: string; statePath: string; landed: (page: Page) => Locator }) {
  await page.goto(`${ADMIN}/en/login`);
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel('Password').fill(opts.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const enrol = page.getByRole('heading', { name: 'Set up two-factor authentication' });
  const verify = page.getByRole('heading', { name: 'Two-factor verification' });
  await expect(enrol.or(verify)).toBeVisible();

  let secret: string;
  if (await enrol.isVisible()) {
    secret = (await page.locator('code').first().innerText()).trim();
    mkdirSync(dirname(opts.secretFile), { recursive: true });
    writeFileSync(opts.secretFile, secret);
  } else {
    if (!existsSync(opts.secretFile)) throw new Error(`2FA already enrolled for ${opts.email} but no local secret; reset the account 2FA`);
    secret = readFileSync(opts.secretFile, 'utf8').trim();
  }
  const codesTitle = page.getByRole('heading', { name: 'Recovery codes' });
  const landed = opts.landed(page);
  const rejected = page.getByRole('main').getByRole('alert').or(page.locator('.bg-danger-50[role="alert"]'));

  await page.getByLabel('Verification code 1').fill(authenticator.generate(secret));
  await expect(codesTitle.or(landed).or(rejected)).toBeVisible({ timeout: 15_000 });
  if (await rejected.isVisible()) {
    // The server refuses a code from an already-used 30 s step (replay protection): wait for the next step.
    await page.waitForTimeout(authenticator.timeRemaining() * 1000 + 500);
    await page.getByLabel('Verification code 1').fill(authenticator.generate(secret));
  }
  await expect(codesTitle.or(landed)).toBeVisible({ timeout: 15_000 });
  if (await codesTitle.isVisible()) await page.getByRole('button', { name: "I've saved these codes, continue" }).click();
  await expect(landed).toBeVisible();
  await page.context().storageState({ path: opts.statePath });
}
