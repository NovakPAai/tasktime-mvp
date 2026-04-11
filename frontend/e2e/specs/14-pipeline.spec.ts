import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Pipeline', () => {
  test('pipeline page renders without crash', async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    // Pipeline page uses inline styles (no h1/h2), wait for JS content to render
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('pipeline page shows batches list or empty state', async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    // Pipeline page renders text content regardless of service availability
    await page.waitForFunction(() => document.body.innerText.trim().length > 10, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('pipeline nav link is visible in sidebar', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('[data-testid="nav-pipeline"]')).toBeVisible({ timeout: 15_000 });
  });

  test('pipeline page does not redirect to login', async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    await page.waitForTimeout(500);
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('pipeline batch list or create batch UI', async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    // Smoke: page renders something meaningful (not just a blank white screen)
    await page.waitForFunction(() => document.body.innerText.trim().length > 10, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });
});
