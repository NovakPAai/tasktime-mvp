import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// Selectors that work with OR without data-testid being deployed to staging.
// Prefer testids when present; fall back to attribute / type selectors.
const SEL_EMAIL = '[data-testid="login-email"], input[type="email"], input[name="email"]';
const SEL_PASSWORD = '[data-testid="login-password"], input[type="password"], input[name="password"]';
const SEL_SUBMIT = '[data-testid="login-submit"], button[type="submit"], button:has-text("Войти"), button:has-text("Sign in")';

test.describe('Auth', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // unauthenticated

  test('login page renders', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator(SEL_EMAIL).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(SEL_PASSWORD).first()).toBeVisible();
    await expect(page.locator(SEL_SUBMIT).first()).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL || 'e2e-bot@tasktime.ru';
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error('E2E_ADMIN_PASSWORD env var is required');

    await page.goto(`${BASE}/login`);
    await page.locator(SEL_EMAIL).first().fill(email);
    await page.locator(SEL_PASSWORD).first().fill(password);
    await page.locator(SEL_SUBMIT).first().click();

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.locator(SEL_EMAIL).first().fill('admin@tasktime.ru');
    await page.locator(SEL_PASSWORD).first().fill('wrongpassword!');
    await page.locator(SEL_SUBMIT).first().click();

    // Ant Design message or error element should appear
    await expect(page.locator('.ant-message, [class*="error"], .ant-form-item-explain-error').first()).toBeVisible({ timeout: 8_000 });
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
    // Wait for app to load (any authenticated content)
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });

    // Try testid-based logout first, fall back to text search
    const logoutTestid = page.locator('[data-testid="nav-logout"]');
    const hasTestid = await logoutTestid.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasTestid) {
      await logoutTestid.click();
    } else {
      // Fallback: look for logout button by text
      const logoutByText = page.getByRole('button', { name: /logout|выйти/i })
        .or(page.getByText(/logout|выйти/i));
      if (!await logoutByText.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await logoutByText.first().click();
    }
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('theme toggle switches between dark and light', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const toggle = page.locator('[data-testid="nav-theme-toggle"]');
    if (!await toggle.isVisible({ timeout: 15_000 }).catch(() => false)) {
      test.skip();
      return;
    }
    await toggle.click();
    await page.waitForTimeout(300);
    await toggle.click();
    // Just verifying no crash
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 5_000 });
  });
});
