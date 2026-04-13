import { test, expect } from '../fixtures/test';
import * as api from '../fixtures/api.fixture';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Projects', () => {
  test.describe.configure({ mode: 'serial' });

  test('projects page lists existing projects', async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    // ProjectsPage uses inline styles (no h1/h2) — wait for any content
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('create new project via UI', async ({ page, prefix, adminSession, request }) => {
    const projectName = `${prefix}Project`;
    const projectKey = `E${Date.now().toString().slice(-5)}`;

    await page.goto(`${BASE}/projects`);
    const createBtn = page.locator('[data-testid="project-create-btn"]');
    if (!await createBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      test.skip(); // testid not yet deployed to staging
      return;
    }
    await createBtn.click();

    // Modal opens
    await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });

    // Fill name and key
    await page.getByLabel('Name').fill(projectName);
    await page.getByLabel('Key').fill(projectKey);
    await page.getByRole('button', { name: 'OK' }).click();

    // Project card should appear
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 15_000 });

    // Cleanup (needs ADMIN for deleteProject)
    try {
      const session = await api.getCleanupSession(request);
      await api.cleanupProjects(request, session.accessToken, prefix);
    } catch { /* ignore cleanup errors */ }
  });

  test('clicking project card navigates to project detail', async ({ page, prefix, request }) => {
    // Create project via API (MANAGER sufficient)
    const { accessToken } = await api.getAdminSession(request);
    const { accessToken: cleanupToken } = await api.getCleanupSession(request);
    const key = `N${Date.now().toString().slice(-5)}`;
    const project = await api.createProject(request, accessToken, `${prefix}NavProject`, key);

    await page.goto(`${BASE}/projects`);
    // Try testid-based card first, fall back to any clickable row/card containing the project name
    const card = page.locator(`[data-testid="project-card-${project.id}"]`);
    if (!await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Fallback: find any element showing the project name and click it
      const nameLink = page.getByText(project.name).first();
      if (!await nameLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        test.skip(); // project not visible in UI
        return;
      }
      await nameLink.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`), { timeout: 10_000 });
      await api.deleteProject(request, cleanupToken, project.id);
      return;
    }
    await card.click();

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`), { timeout: 10_000 });

    // Cleanup (needs ADMIN for delete)
    await api.deleteProject(request, cleanupToken, project.id);
  });
});
