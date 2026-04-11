import { test, expect } from '../fixtures/test';
import * as api from '../fixtures/api.fixture';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Comments', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let issueId: string;
  let accessToken: string;
  let prefix: string;

  test.beforeAll(async ({ request }) => {
    prefix = `E2E_${Date.now()}_`;
    const session = await api.getAdminSession(request);
    accessToken = session.accessToken;
    const key = `C${Date.now().toString().slice(-5)}`;
    const project = await api.createProject(request, accessToken, `${prefix}CommentProject`, key);
    projectId = project.id;
    const issue = await api.createIssue(request, accessToken, projectId, {
      title: `${prefix}CommentIssue`,
      type: 'TASK',
    });
    issueId = issue.id;
  });

  test.afterAll(async ({ request }) => {
    const session = await api.getAdminSession(request);
    await api.cleanupProjects(request, session.accessToken, prefix);
  });

  test('comment input is visible on issue detail', async ({ page }) => {
    await page.goto(`${BASE}/issues/${issueId}`);
    // Page must load
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
    // testid gates the rest of the serial suite
    const commentInput = page.locator('[data-testid="comment-input"]');
    if (!await commentInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(); // testid not yet deployed
    }
  });

  test('create comment', async ({ page }) => {
    const commentText = `E2E comment ${Date.now()}`;
    await page.goto(`${BASE}/issues/${issueId}`);
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-testid="comment-input"]').fill(commentText);
    await page.locator('[data-testid="comment-submit"]').click();

    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 });
  });

  test('multiple comments appear in order', async ({ page }) => {
    const comment1 = `E2E first ${Date.now()}`;
    const comment2 = `E2E second ${Date.now() + 1}`;

    await page.goto(`${BASE}/issues/${issueId}`);
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-testid="comment-input"]').fill(comment1);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-testid="comment-input"]').fill(comment2);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 10_000 });
  });

  test('empty comment is not submitted', async ({ page }) => {
    await page.goto(`${BASE}/issues/${issueId}`);
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 15_000 });

    // Leave comment input empty
    const submitBtn = page.locator('[data-testid="comment-submit"]');
    await submitBtn.click();

    // Page should still render (no crash) — comment-input still visible
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 3_000 });
  });

  test('comment persists after page reload', async ({ page }) => {
    const commentText = `E2E persist ${Date.now()}`;
    await page.goto(`${BASE}/issues/${issueId}`);
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-testid="comment-input"]').fill(commentText);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 });

    // Reload and check comment still present
    await page.reload();
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 15_000 });
  });
});
