import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@tasktime.ru';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'password123';

test.describe('Основные пользовательские сценарии', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Login' }).click();
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('Auth: логин и логаут', async ({ page }) => {
    await page.getByRole('button', { name: /admin@tasktime\.ru/i }).click();
    await page.getByRole('menuitem', { name: /Logout/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'TaskTime' })).toBeVisible();
  });

  test('Projects & Issues: создание задачи из проекта', async ({ page }) => {
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/projects$/);

    const firstProjectRow = page.getByRole('row').nth(1);
    const projectLink = firstProjectRow.getByRole('link');
    await projectLink.click();

    await expect(page).toHaveURL(/\/projects\/.+$/);
    await page.getByRole('button', { name: 'New Issue' }).click();

    await page.getByLabel('Title').fill('E2E: main flow issue');
    await page.getByLabel('Description').fill('Issue created by Playwright e2e test');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Issue created')).toBeVisible();
    await expect(page.getByText('E2E: main flow issue')).toBeVisible();
  });

  test('Board: drag-n-drop задачи между статусами', async ({ page }) => {
    await page.getByRole('link', { name: 'Projects' }).click();

    const firstProjectRow = page.getByRole('row').nth(1);
    const projectLink = firstProjectRow.getByRole('link');
    await projectLink.click();

    await page.getByRole('button', { name: 'Board' }).click();
    await expect(page).toHaveURL(/\/projects\/.+\/board$/);
    await expect(page.getByText('Board')).toBeVisible();

    const firstOpenColumn = page.getByText(/Open \(/).first();
    const issueCard = firstOpenColumn.locator('a').first();
    const issueTitle = await issueCard.textContent();

    const doneColumn = page.getByText(/Done \(/).first();

    await issueCard.dragTo(doneColumn);

    await page.reload();
    await expect(page.getByText(issueTitle || '')).toBeVisible();
  });

  test('Time tracking и комментарии на задаче', async ({ page }) => {
    await page.getByRole('link', { name: 'Projects' }).click();

    const firstProjectRow = page.getByRole('row').nth(1);
    const projectLink = firstProjectRow.getByRole('link');
    await projectLink.click();

    const issueRow = page.getByRole('row').nth(1);
    await issueRow.click();

    await expect(page).toHaveURL(/\/issues\/.+$/);
    await expect(page.getByText('Time Tracking')).toBeVisible();

    await page.getByRole('button', { name: 'Start Timer' }).click();
    await expect(page.getByText('Timer started')).toBeVisible();

    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Stop Timer' }).click();

    await expect(page.getByText('Timer stopped')).toBeVisible();
    await expect(page.getByText(/h/)).toBeVisible();

    const commentText = `E2E comment ${Date.now()}`;
    await page.getByPlaceholder('Write a comment...').fill(commentText);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(commentText)).toBeVisible();
  });

  test('My Time: просмотр залогированного времени', async ({ page }) => {
    await page.getByRole('link', { name: 'My Time' }).click();
    await expect(page).toHaveURL(/\/time$/);
    await expect(page.getByText('My Time')).toBeVisible();
    await expect(page.getByText('Total logged')).toBeVisible();
  });
});

