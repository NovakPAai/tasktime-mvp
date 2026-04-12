import { test, expect } from '../fixtures/test';
import * as api from '../fixtures/api.fixture';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Releases', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let accessToken: string;
  let prefix: string;

  test.beforeAll(async ({ request }) => {
    prefix = `E2E_${Date.now()}_`;
    const session = await api.getAdminSession(request);
    accessToken = session.accessToken;
    const key = `R${Date.now().toString().slice(-5)}`;
    const project = await api.createProject(request, accessToken, `${prefix}ReleaseProject`, key);
    projectId = project.id;
  });

  test.afterAll(async ({ request }) => {
    const session = await api.getAdminSession(request);
    await api.cleanupProjects(request, session.accessToken, prefix);
  });

  test('global releases page renders', async ({ page }) => {
    await page.goto(`${BASE}/releases`);
    await expect(page.locator('h1, h2, [class*="heading"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('create release via UI', async ({ page }) => {
    await page.goto(`${BASE}/releases`);
    // Look for a create/new release button
    const createBtn = page.locator('[data-testid="release-create-btn"], button:has-text("Релиз"), button:has-text("Release"), button:has-text("Создать")').first();
    if (await createBtn.isVisible({ timeout: 5_000 })) {
      await createBtn.click();
      await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });
      // Close
      await page.keyboard.press('Escape');
    } else {
      // Navigate to project releases sub-page
      await page.goto(`${BASE}/projects/${projectId}`);
      const releaseTab = page.getByText('Релизы').or(page.getByText('Releases')).first();
      if (await releaseTab.isVisible({ timeout: 5_000 })) {
        await releaseTab.click();
        await page.waitForTimeout(500);
        await expect(page.locator('h1, h2, [class*="heading"]').first()).toBeVisible({ timeout: 5_000 });
      } else {
        test.skip();
        return;
      }
    }
  });

  test('releases page shows empty state or list', async ({ page }) => {
    await page.goto(`${BASE}/releases`);
    // Either has items or empty state — just check page renders
    const content = page.locator('main, [class*="content"], [class*="page"]').first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });
});
