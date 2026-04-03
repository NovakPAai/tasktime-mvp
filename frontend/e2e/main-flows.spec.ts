import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@tasktime.ru';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'password123';
const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:3000/api';

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

interface AuthSession {
  accessToken: string;
  userId: string;
}

interface TimeSummaryResponse {
  userId: string;
  humanHours: number;
  agentHours: number;
  totalHours: number;
  agentCost: number;
}

async function createAiSession(
  request: APIRequestContext,
  accessToken: string,
  userId: string,
  issueId: string,
  {
    startedAt,
    finishedAt,
    costMoney,
    notes,
  }: {
    startedAt: string;
    finishedAt: string;
    costMoney: number;
    notes: string;
  },
) {
  const aiSessionRes = await request.post(apiUrl('/ai-sessions'), {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      issueId,
      userId,
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      startedAt,
      finishedAt,
      tokensInput: 1000,
      tokensOutput: 500,
      costMoney,
      notes,
      issueSplits: [{ issueId, ratio: 1 }],
    },
  });
  expect(aiSessionRes.ok()).toBeTruthy();
  return await aiSessionRes.json();
}

async function getAuthSession(request: APIRequestContext): Promise<AuthSession> {
  const authRes = await request.post(apiUrl('/auth/login'), {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });
  expect(authRes.ok()).toBeTruthy();

  const { accessToken, user } = await authRes.json();
  return {
    accessToken: accessToken as string,
    userId: (user as { id: string }).id,
  };
}

async function getUserTimeSummary(
  request: APIRequestContext,
  accessToken: string,
  userId: string,
): Promise<TimeSummaryResponse> {
  const summaryRes = await request.get(apiUrl(`/users/${userId}/time/summary`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(summaryRes.ok()).toBeTruthy();
  return await summaryRes.json() as TimeSummaryResponse;
}

async function createProjectAndIssue(
  request: APIRequestContext,
  accessToken: string,
  {
    projectKey,
    projectName,
    issueTitle,
    issueDescription,
  }: {
    projectKey: string;
    projectName: string;
    issueTitle: string;
    issueDescription?: string;
  },
) {
  const projectRes = await request.post(apiUrl('/projects'), {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      name: projectName,
      key: projectKey,
    },
  });
  expect(projectRes.ok()).toBeTruthy();
  const project = await projectRes.json();

  const issueRes = await request.post(apiUrl(`/projects/${project.id}/issues`), {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: issueTitle,
      description: issueDescription,
      type: 'TASK',
    },
  });
  expect(issueRes.ok()).toBeTruthy();
  const issue = await issueRes.json();

  return { project, issue };
}

test.describe('Основные пользовательские сценарии', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Login' }).click();
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('Auth: логин и логаут', async ({ page }) => {
    await expect(page.getByText(/Admin User \(ADMIN\)/i)).toBeVisible();
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Flow Universe')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('Projects & Issues: создание задачи из проекта', async ({ page, request }) => {
    const { accessToken } = await getAuthSession(request);
    const suffix = Date.now().toString().slice(-6);
    const projectKey = `U${suffix}`;
    const projectName = `UI Project ${suffix}`;

    const projectRes = await request.post('/api/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: projectName,
        key: projectKey,
      },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();

    await page.getByRole('menuitem', { name: /Projects/i }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.getByText(projectName, { exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
    await page.getByRole('button', { name: 'New Issue' }).click();

    await page.getByLabel('Title').fill('E2E: main flow issue');
    await page.getByLabel('Description').fill('Issue created by Playwright e2e test');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Issue created')).toBeVisible();
    await expect(page.getByText('E2E: main flow issue')).toBeVisible();
  });

  test('Board: статус задачи отражается на доске после reorder', async ({ page, request }) => {
    const { accessToken } = await getAuthSession(request);
    const suffix = Date.now().toString().slice(-6);
    const projectKey = `B${suffix}`;
    const issueTitle = `Board issue ${suffix}`;
    const { project, issue } = await createProjectAndIssue(request, accessToken, {
      projectKey,
      projectName: `Board Project ${suffix}`,
      issueTitle,
    });

    await page.getByRole('menuitem', { name: /Projects/i }).click();
    await page.getByText(`Board Project ${suffix}`, { exact: true }).click();

    await page.getByRole('button', { name: 'Board' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`));
    await expect(page.getByText('Kanban board')).toBeVisible();

    const firstOpenColumn = page
      .locator('.tt-board-column')
      .filter({ has: page.locator('.tt-board-column-chip', { hasText: 'Open' }) })
      .first();
    const issueCard = firstOpenColumn.locator('.tt-board-card').first();

    const doneColumn = page
      .locator('.tt-board-column')
      .filter({ has: page.locator('.tt-board-column-chip', { hasText: 'Done' }) })
      .first();

    await expect(issueCard).toBeVisible();

    const reorderRes = await request.patch(`/api/projects/${project.id}/board/reorder`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        updates: [{ id: issue.id, status: 'DONE', orderIndex: 0 }],
      },
    });
    expect(reorderRes.ok()).toBeTruthy();

    await page.reload();
    await expect(doneColumn.getByText(issueTitle)).toBeVisible();
  });

  test('Time tracking и комментарии на задаче', async ({ page, request }) => {
    const { accessToken } = await getAuthSession(request);
    const suffix = Date.now().toString().slice(-6);
    const issueTitle = `Time issue ${suffix}`;
    await createProjectAndIssue(request, accessToken, {
      projectKey: `T${suffix}`,
      projectName: `Time Project ${suffix}`,
      issueTitle,
      issueDescription: 'Issue for time tracking e2e',
    });

    await page.getByRole('menuitem', { name: /Projects/i }).click();
    await page.getByText(`Time Project ${suffix}`, { exact: true }).click();
    await page.getByText(issueTitle, { exact: true }).click();

    await expect(page).toHaveURL(/\/issues\/.+$/);
    await expect(page.getByText('Time Tracking', { exact: true })).toBeVisible();

    const manualNote = `Manual time ${suffix}`;
    await page.getByRole('button', { name: 'Log time' }).click();
    await page.getByLabel('Hours').fill('1.5');
    await page.getByLabel('Note').fill(manualNote);
    await page.getByRole('button', { name: 'OK' }).click();

    await expect(page.getByText('1.50h')).toBeVisible();
    await expect(page.getByText(manualNote)).toBeVisible();

    const commentText = `E2E comment ${Date.now()}`;
    await page.getByPlaceholder('Write a comment...').fill(commentText);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(commentText)).toBeVisible();
  });

  test('My Time: просмотр залогированного времени', async ({ page, request }) => {
    const { accessToken, userId } = await getAuthSession(request);
    const suffix = Date.now().toString().slice(-6);
    const beforeSummary = await getUserTimeSummary(request, accessToken, userId);
    const { issue } = await createProjectAndIssue(request, accessToken, {
      projectKey: `M${suffix}`,
      projectName: `My Time Project ${suffix}`,
      issueTitle: `My Time issue ${suffix}`,
    });

    const humanNote = `E2E recent human ${suffix}`;
    const backdatedHumanNote = `E2E backdated human ${suffix}`;
    const aiNote = `E2E ai work ${suffix}`;
    const backdatedLogDate = '2024-01-02';

    const recentHumanRes = await request.post(apiUrl(`/issues/${issue.id}/time`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        hours: 1.5,
        note: humanNote,
      },
    });
    expect(recentHumanRes.ok()).toBeTruthy();

    const backdatedHumanRes = await request.post(apiUrl(`/issues/${issue.id}/time`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        hours: 0.5,
        note: backdatedHumanNote,
        logDate: backdatedLogDate,
      },
    });
    expect(backdatedHumanRes.ok()).toBeTruthy();

    const aiFinishedAt = new Date();
    const aiStartedAt = new Date(aiFinishedAt.getTime() - 2 * 60 * 60 * 1000);

    await createAiSession(request, accessToken, userId, issue.id, {
      startedAt: aiStartedAt.toISOString(),
      finishedAt: aiFinishedAt.toISOString(),
      costMoney: 12.34,
      notes: aiNote,
    });

    const afterSummary = await getUserTimeSummary(request, accessToken, userId);

    expect(afterSummary.humanHours).toBeCloseTo(beforeSummary.humanHours + 2, 5);
    expect(afterSummary.agentHours).toBeCloseTo(beforeSummary.agentHours + 2, 5);
    expect(afterSummary.agentCost).toBeCloseTo(beforeSummary.agentCost + 12.34, 5);
    expect(afterSummary.totalHours).toBeCloseTo(beforeSummary.totalHours + 4, 5);

    await page.getByRole('menuitem', { name: /My Time/i }).click();
    await expect(page).toHaveURL(/\/time$/);
    await expect(page.getByText('My Time')).toBeVisible();
    await expect(page.getByText('All-time summary')).toBeVisible();
    await expect(page.getByText('Filters below affect the log table only.')).toBeVisible();
    await expect(page.getByTestId('time-summary-human')).toContainText('Human');
    await expect(page.getByTestId('time-summary-human')).toContainText(`${afterSummary.humanHours.toFixed(2)}h`);
    await expect(page.getByTestId('time-summary-ai')).toContainText('AI');
    await expect(page.getByTestId('time-summary-ai')).toContainText(`${afterSummary.agentHours.toFixed(2)}h`);
    await expect(page.getByTestId('time-summary-ai-cost')).toContainText('AI cost');
    await expect(page.getByTestId('time-summary-ai-cost')).toContainText(afterSummary.agentCost.toFixed(4));
    await expect(page.getByTestId('time-summary-total')).toContainText('Total');
    await expect(page.getByTestId('time-summary-total')).toContainText(`${afterSummary.totalHours.toFixed(2)}h`);
    await expect(page.getByText(humanNote)).toBeVisible();
    await expect(page.getByText(aiNote)).toBeVisible();
    await expect(page.getByText(backdatedHumanNote)).not.toBeVisible();

    await page.getByRole('button', { name: 'All time' }).click();
    const backdatedRow = page.getByRole('row').filter({ hasText: backdatedHumanNote }).first();
    await expect(backdatedRow).toBeVisible();
    await expect(backdatedRow).toContainText(backdatedLogDate);
  });

  test('Sprints: drawer opens from project and global pages with summary and issue table', async ({
    page,
    request,
  }) => {
    const authRes = await request.post('/api/auth/login', {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });
    expect(authRes.ok()).toBeTruthy();

    const { accessToken } = await authRes.json();
    const suffix = Date.now().toString().slice(-6);
    const projectKey = `E${suffix}`;
    const sprintName = `E2E Sprint Drawer ${suffix}`;
    const issueTitle = `E2E sprint issue ${suffix}`;

    const projectRes = await request.post('/api/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `E2E Sprint Project ${suffix}`,
        key: projectKey,
      },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();

    const issueRes = await request.post(`/api/projects/${project.id}/issues`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: issueTitle,
        type: 'TASK',
      },
    });
    expect(issueRes.ok()).toBeTruthy();
    const issue = await issueRes.json();

    const sprintRes = await request.post(`/api/projects/${project.id}/sprints`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: sprintName,
        goal: 'Ensure sprint drawer remains readable and stable in the dark theme.',
      },
    });
    expect(sprintRes.ok()).toBeTruthy();
    const sprint = await sprintRes.json();

    const moveRes = await request.post(`/api/sprints/${sprint.id}/issues`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        issueIds: [issue.id],
      },
    });
    expect(moveRes.ok()).toBeTruthy();

    await page.goto(`/projects/${project.id}/sprints`);
    await expect(page.getByRole('heading', { name: 'Sprints' })).toBeVisible();
    await page.getByRole('button', { name: 'Открыть детали' }).click();

    await expect(page.getByText('Обзор спринта')).toBeVisible();
    await expect(page.getByText('Задачи в спринте')).toBeVisible();
    await expect(page.getByRole('heading', { name: sprintName })).toBeVisible();
    await expect(page.getByRole('button', { name: issueTitle })).toBeVisible();
    await expect(page.getByRole('link', { name: `${projectKey}-1` })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: sprintName })).toBeHidden();

    await page.goto('/sprints');
    await expect(page).toHaveURL(/\/sprints$/);

    const sprintCard = page.locator('.ant-card').filter({ hasText: sprintName }).first();
    await expect(sprintCard).toBeVisible();
    await sprintCard.getByRole('button', { name: 'Открыть детали' }).click();

    await expect(page.getByText('Обзор спринта')).toBeVisible();
    await expect(page.getByText('Задачи в спринте')).toBeVisible();
    await expect(page.getByRole('button', { name: issueTitle })).toBeVisible();
  });

  test('Sprint issue preview drawer: key opens issue page, title opens nested preview, edit button navigates to full page', async ({
    page,
    request,
  }) => {
    const authRes = await request.post('/api/auth/login', {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });
    expect(authRes.ok()).toBeTruthy();

    const { accessToken } = await authRes.json();
    const suffix = Date.now().toString().slice(-6);
    const projectKey = `P${suffix}`;
    const sprintName = `E2E Preview Sprint ${suffix}`;
    const issueTitle = `E2E preview issue ${suffix}`;
    const issueDescription = 'Issue preview should stay read-only and offer a path to full editing.';

    const projectRes = await request.post('/api/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `E2E Preview Project ${suffix}`,
        key: projectKey,
      },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();

    const issueRes = await request.post(`/api/projects/${project.id}/issues`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: issueTitle,
        description: issueDescription,
        type: 'TASK',
      },
    });
    expect(issueRes.ok()).toBeTruthy();
    const issue = await issueRes.json();

    const sprintRes = await request.post(`/api/projects/${project.id}/sprints`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: sprintName,
        goal: 'Verify nested sprint issue preview drawer behavior.',
      },
    });
    expect(sprintRes.ok()).toBeTruthy();
    const sprint = await sprintRes.json();

    const moveRes = await request.post(`/api/sprints/${sprint.id}/issues`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        issueIds: [issue.id],
      },
    });
    expect(moveRes.ok()).toBeTruthy();

    await page.goto(`/projects/${project.id}/sprints`);
    await page.getByRole('button', { name: 'Открыть детали' }).click();

    await expect(page.getByText('Задачи в спринте')).toBeVisible();
    await page.getByRole('link', { name: `${projectKey}-1` }).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${issue.id}$`));

    await page.goto(`/projects/${project.id}/sprints`);
    await page.getByRole('button', { name: 'Открыть детали' }).click();
    await expect(page.getByText('Задачи в спринте')).toBeVisible();
    await page.getByText(issueTitle, { exact: true }).click();

    await expect(page.getByText('Детали задачи')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible();
    await expect(page.getByText(issueDescription)).toBeVisible();

    await page.getByRole('button', { name: 'Редактировать' }).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${issue.id}$`));
  });

  test('Sidebar: business and flow team tabs expose synthetic team workspaces', async ({
    page,
  }) => {
    const sidebar = page.locator('.tt-sidebar-menu');

    await expect(
      sidebar.getByText('Бизнес-функциональные команды', { exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText('Потоковые команды', { exact: true })).toBeVisible();

    await sidebar.getByText('Бизнес-функциональные команды', { exact: true }).click();
    await expect(page).toHaveURL(/\/business-teams$/);
    await expect(
      page.getByRole('heading', { name: 'Бизнес-функциональные команды' }),
    ).toBeVisible();
    await expect(page.getByText('Платежный контур')).toBeVisible();
    await expect(
      page.locator('.tt-team-card').first().getByText('Активные инициативы', { exact: true }),
    ).toBeVisible();

    await sidebar.getByText('Потоковые команды', { exact: true }).click();
    await expect(page).toHaveURL(/\/flow-teams$/);
    await expect(page.getByRole('heading', { name: 'Потоковые команды' })).toBeVisible();
    await expect(page.getByText('Поток инцидентов')).toBeVisible();
    await expect(
      page.locator('.tt-team-card').first().getByText('Задачи потока', { exact: true }),
    ).toBeVisible();
  });
});

