import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Auth', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // unauthenticated

  test('login page renders', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL || 'admin@tasktime.ru';
    const password = process.env.E2E_ADMIN_PASSWORD || 'password123';

    await page.goto(`${BASE}/login`);
    await page.locator('[data-testid="login-email"]').fill(email);
    await page.locator('[data-testid="login-password"]').fill(password);
    await page.locator('[data-testid="login-submit"]').click();

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.locator('[data-testid="login-email"]').fill('admin@tasktime.ru');
    await page.locator('[data-testid="login-password"]').fill('wrongpassword!');
    await page.locator('[data-testid="login-submit"]').click();

    // Ant Design message or error should appear
    await expect(page.locator('.ant-message, [class*="error"]').first()).toBeVisible({ timeout: 8_000 });
    // Should remain on login page
    await expect(page).toHaveURL(/\/login$/);
  });

  test('protected route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Auth — authenticated', () => {
  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto(`${BASE}/`);
    // Wait for sidebar
    await expect(page.locator('[data-testid="nav-logout"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="nav-logout"]').click();
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('theme toggle switches between dark and light', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const toggle = page.locator('[data-testid="nav-theme-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    // Click once (switch to light or dark)
    await toggle.click();
    await page.waitForTimeout(300);
    // Click back
    await toggle.click();
    // Just verifying no crash — page still renders
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
  });
});
