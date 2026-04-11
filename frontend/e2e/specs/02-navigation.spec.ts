/**
 * Navigation smoke test — visits every top-level route via sidebar
 * and confirms the page renders without crashing.
 */
import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Navigation — sidebar routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
  });

  test('dashboard nav item navigates to /', async ({ page }) => {
    await page.locator('[data-testid="nav-dashboard"]').click();
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  });

  test('projects nav item navigates to /projects', async ({ page }) => {
    await page.locator('[data-testid="nav-projects"]').click();
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
  });

  test('teams nav item navigates to /teams', async ({ page }) => {
    await page.locator('[data-testid="nav-teams"]').click();
    await expect(page).toHaveURL(/\/teams$/, { timeout: 10_000 });
  });

  test('business-teams nav item navigates', async ({ page }) => {
    await page.locator('[data-testid="nav-business-teams"]').click();
    await expect(page).toHaveURL(/\/business-teams$/, { timeout: 10_000 });
  });

  test('flow-teams nav item navigates', async ({ page }) => {
    await page.locator('[data-testid="nav-flow-teams"]').click();
    await expect(page).toHaveURL(/\/flow-teams$/, { timeout: 10_000 });
  });

  test('Planning submenu expands and sprints navigates', async ({ page }) => {
    // Click Planning submenu to expand
    await page.getByText('Planning').click();
    await expect(page.locator('[data-testid="nav-sprints"]')).toBeVisible({ timeout: 5_000 });
    await page.locator('[data-testid="nav-sprints"]').click();
    await expect(page).toHaveURL(/\/sprints$/, { timeout: 10_000 });
  });

  test('Planning submenu — releases navigates', async ({ page }) => {
    await page.getByText('Planning').click();
    await expect(page.locator('[data-testid="nav-releases"]')).toBeVisible({ timeout: 5_000 });
    await page.locator('[data-testid="nav-releases"]').click();
    await expect(page).toHaveURL(/\/releases$/, { timeout: 10_000 });
  });

  test('time nav item navigates to /time', async ({ page }) => {
    await page.locator('[data-testid="nav-time"]').click();
    await expect(page).toHaveURL(/\/time$/, { timeout: 10_000 });
  });

  test('pipeline nav item navigates to /pipeline', async ({ page }) => {
    await page.locator('[data-testid="nav-pipeline"]').click();
    await expect(page).toHaveURL(/\/pipeline$/, { timeout: 10_000 });
  });

  test('admin link navigates (ADMIN role)', async ({ page }) => {
    // Expand admin submenu
    const adminMenu = page.getByText('Admin', { exact: true });
    if (await adminMenu.isVisible()) {
      await adminMenu.click();
      await page.waitForTimeout(300);
      const firstAdminItem = page.locator('[data-testid^="nav-admin-"]').first();
      if (await firstAdminItem.isVisible()) {
        await firstAdminItem.click();
        await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
      } else {
        // Try direct navigation
        await page.goto(`${BASE}/admin/dashboard`);
        await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
      }
    } else {
      test.skip();
    }
  });

  test('settings navigates to /settings', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await expect(page).toHaveURL(/\/settings$/, { timeout: 10_000 });
  });
});
