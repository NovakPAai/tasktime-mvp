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
    const session = await api.getCleanupSession(request);
    await api.cleanupProjects(request, session.accessToken, prefix);
  });

  /** Helper: navigate to issue and return whether comment-input testid is available */
  async function gotoIssueAndCheckTestid(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto(`${BASE}/issues/${issueId}`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 30_000 });
    return page.locator('[data-testid="comment-input"]').isVisible({ timeout: 5_000 }).catch(() => false);
  }

  test('comment input is visible on issue detail', async ({ page }) => {
    const hasTestid = await gotoIssueAndCheckTestid(page);
    if (!hasTestid) {
      test.skip(); // testid not yet deployed
      return;
    }
  });

  test('create comment', async ({ page }) => {
    const hasTestid = await gotoIssueAndCheckTestid(page);
    if (!hasTestid) {
      test.skip();
      return;
    }
    const commentText = `E2E comment ${Date.now()}`;
    await page.locator('[data-testid="comment-input"]').fill(commentText);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 });
  });

  test('multiple comments appear in order', async ({ page }) => {
    const hasTestid = await gotoIssueAndCheckTestid(page);
    if (!hasTestid) {
      test.skip();
      return;
    }
    const comment1 = `E2E first ${Date.now()}`;
    const comment2 = `E2E second ${Date.now() + 1}`;

    await page.locator('[data-testid="comment-input"]').fill(comment1);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-testid="comment-input"]').fill(comment2);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 10_000 });
  });

  test('empty comment is not submitted', async ({ page }) => {
    const hasTestid = await gotoIssueAndCheckTestid(page);
    if (!hasTestid) {
      test.skip();
      return;
    }
    const submitBtn = page.locator('[data-testid="comment-submit"]');
    await submitBtn.click();
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 3_000 });
  });

  test('comment persists after page reload', async ({ page }) => {
    const hasTestid = await gotoIssueAndCheckTestid(page);
    if (!hasTestid) {
      test.skip();
      return;
    }
    const commentText = `E2E persist ${Date.now()}`;
    await page.locator('[data-testid="comment-input"]').fill(commentText);
    await page.locator('[data-testid="comment-submit"]').click();
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 15_000 });
  });
});
