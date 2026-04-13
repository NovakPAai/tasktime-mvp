import { chromium, type FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-bot@tasktime.ru';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error('E2E_ADMIN_PASSWORD env var is required');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export const AUTH_FILE = path.join(__dirname, '.auth/admin.json');

async function globalSetup(_config: FullConfig) {
  // Ensure .auth dir exists
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`);

    // Fill email
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
    await emailInput.fill(ADMIN_EMAIL);

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(ADMIN_PASSWORD);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Wait for successful login (dashboard heading or redirect away from /login)
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });

    // Save storageState (captures localStorage with accessToken + refreshToken)
    await context.storageState({ path: AUTH_FILE });
    console.log(`[global-setup] Auth state saved to ${AUTH_FILE}`);
  } catch (err) {
    console.error('[global-setup] Login failed:', err);
    throw new Error(
      `E2E global-setup: failed to login as ${ADMIN_EMAIL}. ` +
      `Is staging reachable at ${BASE_URL}? Check E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars.`
    );
  } finally {
    await browser.close();
  }
}

export default globalSetup;
