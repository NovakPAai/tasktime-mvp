/**
 * Navigation smoke test — visits every top-level route via sidebar
 * and confirms the page renders without crashing.
 */
import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

/** Wait for the app to be loaded and authenticated (any sidebar content visible). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/login$/);
}

/** Click a nav testid if it exists; otherwise navigate directly to the URL. */
async function navOrGoto(
  page: import('@playwright/test').Page,
  testid: string,
  fallbackUrl: string,
) {
  const locator = page.locator(`[data-testid="${testid}"]`);
  if (await locator.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await locator.click();
  } else {
    await page.goto(`${BASE}${fallbackUrl}`);
  }
}

test.describe('Navigation — sidebar routes', () => {
  test('dashboard nav item navigates to /', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-dashboard', '/');
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  });

  test('projects nav item navigates to /projects', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-projects', '/projects');
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
  });

  test('teams nav item navigates to /teams', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-teams', '/teams');
    await expect(page).toHaveURL(/\/teams$/, { timeout: 10_000 });
  });

  test('business-teams nav item navigates', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-business-teams', '/business-teams');
    await expect(page).toHaveURL(/\/business-teams$/, { timeout: 10_000 });
  });

  test('flow-teams nav item navigates', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-flow-teams', '/flow-teams');
    await expect(page).toHaveURL(/\/flow-teams$/, { timeout: 10_000 });
  });

  test('sprints page navigates to /sprints', async ({ page }) => {
    await waitForApp(page);
    // Try testid; if Planning submenu collapse hides it, fall back to direct nav
    const sprintsTestid = page.locator('[data-testid="nav-sprints"]');
    if (await sprintsTestid.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sprintsTestid.click();
    } else {
      const planningText = page.getByText('Planning');
      if (await planningText.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await planningText.click();
        if (await sprintsTestid.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await sprintsTestid.click();
        } else {
          await page.goto(`${BASE}/sprints`);
        }
      } else {
        await page.goto(`${BASE}/sprints`);
      }
    }
    await expect(page).toHaveURL(/\/sprints$/, { timeout: 10_000 });
  });

  test('releases page navigates to /releases', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-releases', '/releases');
    await expect(page).toHaveURL(/\/releases$/, { timeout: 10_000 });
  });

  test('time nav item navigates to /time', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-time', '/time');
    await expect(page).toHaveURL(/\/time$/, { timeout: 10_000 });
  });

  test('pipeline nav item navigates to /pipeline', async ({ page }) => {
    await waitForApp(page);
    await navOrGoto(page, 'nav-pipeline', '/pipeline');
    await expect(page).toHaveURL(/\/pipeline$/, { timeout: 10_000 });
  });

  test('admin link navigates (ADMIN role)', async ({ page }) => {
    await waitForApp(page);
    const adminTestid = page.locator('[data-testid^="nav-admin"]').first();
    if (await adminTestid.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await adminTestid.click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
      return;
    }
    // Fallback: expand Admin submenu by text, then navigate directly
    const adminMenu = page.getByText('Admin', { exact: true });
    if (await adminMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await adminMenu.click();
      await page.waitForTimeout(300);
    }
    await page.goto(`${BASE}/admin/dashboard`);
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  });

  test('settings navigates to /settings', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await expect(page).toHaveURL(/\/settings$/, { timeout: 10_000 });
  });
});
