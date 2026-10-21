// Shared helpers for Playwright system (ST) and acceptance (AT) tests.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const PASSWORD = 'Mediflow@123';
const ACTUALS = path.resolve(process.cwd(), 'docs/test-results/actuals.jsonl');
const SHOTS = path.resolve(process.cwd(), 'docs/screenshots');

/** Registers a catalogued E2E test case; `note()` records the actual observation for the Test Report. */
export function tcE2E(meta, fn) {
  test(`${meta.id}: ${meta.title}`, async ({ page, context }, info) => {
    const notes = [];
    const started = Date.now();
    let error = null;
    try {
      await fn({ page, context, note: (s) => notes.push(String(s)), info });
    } catch (e) {
      error = e;
      throw e;
    } finally {
      fs.mkdirSync(path.dirname(ACTUALS), { recursive: true });
      fs.appendFileSync(ACTUALS, `${JSON.stringify({ ...meta, actual: notes.join('; '), status: error ? 'FAIL' : 'PASS', error: error ? String(error.message).split('\n')[0].slice(0, 400) : null, ms: Date.now() - started, ts: new Date().toISOString() })}\n`);
    }
  });
}

/** Log in through the real login form. */
export async function login(page, username) {
  await page.goto('/login');
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

export async function logout(page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Save a screenshot for the report (docs/screenshots/<name>.png). */
export async function shot(page, name, opts = {}) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false, ...opts });
}

export { test, expect };
