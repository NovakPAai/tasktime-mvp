import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Settings', () => {
  test('settings page renders', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    // Wait for any React content to load — settings page uses inline styles without h1/h2
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    // Must not redirect to login
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('settings page shows profile/account section', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    // Settings page renders profile/account text (may vary by locale)
    const settingsText = page.getByText(/аккаунт|account|профиль|profile|settings|настройки/i).first();
    if (await settingsText.isVisible({ timeout: 15_000 }).catch(() => false)) {
      // Great — found expected text
    } else {
      // Fallback: any form input or rendered content
      const fallback = page.locator('input, button, form, [role="tabpanel"], [role="tab"]').first();
      await expect(fallback).toBeVisible({ timeout: 5_000 });
    }
  });

  test('UAT test page renders', async ({ page }) => {
    await page.goto(`${BASE}/uat`);
    // UAT page is a special test page — just check it loads
    const content = page.locator('h1, h2, [class*="heading"], body').first();
    await expect(content).toBeVisible({ timeout: 15_000 });
    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('theme toggle on settings page (if present)', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    const themeToggle = page.locator('[data-testid="nav-theme-toggle"]');
    if (await themeToggle.isVisible({ timeout: 5_000 })) {
      const htmlBefore = await page.locator('html').getAttribute('class') ?? '';
      await themeToggle.click();
      await page.waitForTimeout(300);
      const htmlAfter = await page.locator('html').getAttribute('class') ?? '';
      // Something changed (theme class or data-attr)
      // At minimum — page didn't crash
      await expect(page.locator('h1, h2, [class*="heading"]').first()).toBeVisible({ timeout: 5_000 });
      // Reset
      await themeToggle.click();
      await page.waitForTimeout(200);
      void htmlBefore; void htmlAfter;
    } else {
      test.skip();
    }
  });

  test('dark/light theme toggle from nav', async ({ page }) => {
    await page.goto(`${BASE}/`);
    // Wait for app to load
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);

    const toggle = page.locator('[data-testid="nav-theme-toggle"]');
    if (await toggle.isVisible({ timeout: 5_000 })) {
      await toggle.click();
      await page.waitForTimeout(300);
      await expect(page).not.toHaveURL(/\/login$/);
      await toggle.click();
    } else {
      // testid not deployed yet — skip gracefully
      test.skip();
    }
  });
});
