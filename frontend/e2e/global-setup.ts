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
/**
 * Admin (cleanup) auth state — used for tests that require ADMIN role
 * (admin workflows, team creation, etc.).
 * Falls back gracefully if E2E_CLEANUP_PASSWORD is not set.
 */
export const ADMIN_AUTH_FILE = path.join(__dirname, '.auth/admin-cleanup.json');

async function loginAndSave(
  baseUrl: string,
  email: string,
  password: string,
  outputPath: string,
  label: string,
): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/login`);

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
    await emailInput.fill(email);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(password);

    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });

    // Ensure sidebar is expanded so nav-logout / nav-theme-toggle testids are visible
    await page.evaluate(() => {
      const stored = localStorage.getItem('tt-ui');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { state?: { sidebarCollapsed?: boolean } };
          if (parsed.state) parsed.state.sidebarCollapsed = false;
          localStorage.setItem('tt-ui', JSON.stringify(parsed));
        } catch { /* ignore parse errors */ }
      } else {
        localStorage.setItem('tt-ui', JSON.stringify({ state: { sidebarCollapsed: false }, version: 0 }));
      }
    });

    await context.storageState({ path: outputPath });
    console.log(`[global-setup] Auth state (${label}) saved to ${outputPath}`);
  } catch (err) {
    console.error(`[global-setup] Login failed for ${label}:`, err);
    throw new Error(
      `E2E global-setup: failed to login as ${email}. ` +
      `Is staging reachable at ${baseUrl}? Check env vars.`
    );
  } finally {
    await browser.close();
  }
}

async function globalSetup(_config: FullConfig) {
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Primary session (e2e-bot / MANAGER role)
  await loginAndSave(BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_FILE, 'e2e-bot');

  // Admin session (admin@tasktime.ru / ADMIN role) — needed for admin-only pages
  const cleanupEmail = process.env.E2E_CLEANUP_EMAIL || 'admin@tasktime.ru';
  const cleanupPassword = process.env.E2E_CLEANUP_PASSWORD;
  if (cleanupPassword) {
    await loginAndSave(BASE_URL, cleanupEmail, cleanupPassword, ADMIN_AUTH_FILE, 'admin-cleanup');
  } else {
    // If no cleanup password, copy e2e-bot session as fallback (admin tests will skip gracefully)
    console.warn('[global-setup] E2E_CLEANUP_PASSWORD not set — admin-cleanup auth will mirror e2e-bot session');
    fs.copyFileSync(AUTH_FILE, ADMIN_AUTH_FILE);
  }
}

export default globalSetup;
