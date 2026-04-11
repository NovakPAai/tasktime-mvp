import { test, expect } from '../fixtures/test';
import * as api from '../fixtures/api.fixture';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Issues', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let accessToken: string;
  let prefix: string;

  test.beforeAll(async ({ request }) => {
    prefix = `E2E_${Date.now()}_`;
    const session = await api.getAdminSession(request);
    accessToken = session.accessToken;
    const key = `I${Date.now().toString().slice(-5)}`;
    const project = await api.createProject(request, accessToken, `${prefix}IssueProject`, key);
    projectId = project.id;
  });

  test.afterAll(async ({ request }) => {
    const session = await api.getAdminSession(request);
    await api.cleanupProjects(request, session.accessToken, prefix);
  });

  test('project detail shows issue list', async ({ page }) => {
    await page.goto(`${BASE}/projects/${projectId}`);
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
    await expect(page.locator('[data-testid="issue-create-btn"]')).toBeVisible({ timeout: 15_000 });
  });

  test('create TASK via New Issue button', async ({ page }) => {
    await page.goto(`${BASE}/projects/${projectId}`);
    await page.locator('[data-testid="issue-create-btn"]').click();

    // Modal opens
    await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });

    const title = `E2E Task ${Date.now()}`;
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Issue created')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('navigate to issue detail page', async ({ page, request }) => {
    const issue = await api.createIssue(request, accessToken, projectId, {
      title: `E2E Detail ${Date.now()}`,
      type: 'TASK',
    });

    await page.goto(`${BASE}/issues/${issue.id}`);
    await expect(page).toHaveURL(new RegExp(`/issues/${issue.id}`));
    await expect(page.getByText(issue.title)).toBeVisible({ timeout: 15_000 });
  });

  test('create EPIC hierarchy and STORY child via API', async ({ request }) => {
    const epic = await api.createIssue(request, accessToken, projectId, {
      title: `E2E Epic ${Date.now()}`,
      type: 'EPIC',
    });
    const story = await api.createIssue(request, accessToken, projectId, {
      title: `E2E Story ${Date.now()}`,
      type: 'STORY',
      parentId: epic.id,
    });
    expect(story.id).toBeTruthy();
    expect(epic.id).toBeTruthy();
  });

  test('issue detail: add comment', async ({ page, request }) => {
    const issue = await api.createIssue(request, accessToken, projectId, {
      title: `E2E Comment Issue ${Date.now()}`,
      type: 'TASK',
    });

    await page.goto(`${BASE}/issues/${issue.id}`);
    await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({ timeout: 15_000 });

    const commentText = `E2E comment ${Date.now()}`;
    await page.locator('[data-testid="comment-input"]').fill(commentText);
    await page.locator('[data-testid="comment-submit"]').click();

    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 });
  });

  test('issue status changes via API and page reflects update', async ({ page, request }) => {
    const issue = await api.createIssue(request, accessToken, projectId, {
      title: `E2E Status ${Date.now()}`,
      type: 'TASK',
    });

    // Update status via API
    await api.updateIssue(request, accessToken, issue.id, { status: 'IN_PROGRESS' });

    await page.goto(`${BASE}/issues/${issue.id}`);
    // Check that status is visible somewhere on page
    await expect(page.getByText('IN_PROGRESS').or(page.getByText('В работе')).or(page.getByText('In Progress'))).toBeVisible({ timeout: 15_000 });
  });
});
