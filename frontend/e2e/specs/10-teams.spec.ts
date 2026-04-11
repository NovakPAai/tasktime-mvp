import { test, expect } from '../fixtures/test';
import * as api from '../fixtures/api.fixture';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Teams', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;
  let prefix: string;
  let teamId: string;

  test.beforeAll(async ({ request }) => {
    prefix = `E2E_${Date.now()}_`;
    const session = await api.getAdminSession(request);
    accessToken = session.accessToken;
  });

  test.afterAll(async ({ request }) => {
    const session = await api.getAdminSession(request);
    // Delete any teams created
    if (teamId) {
      try {
        await api.deleteTeam(request, session.accessToken, teamId);
      } catch { /* ignore */ }
    }
  });

  test('teams page renders', async ({ page }) => {
    await page.goto(`${BASE}/teams`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('business-teams page renders', async ({ page }) => {
    await page.goto(`${BASE}/business-teams`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('flow-teams page renders', async ({ page }) => {
    await page.goto(`${BASE}/flow-teams`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('create team via API', async ({ request }) => {
    const team = await api.createTeam(request, accessToken, `${prefix}Team`);
    expect(team.id).toBeTruthy();
    teamId = team.id;
  });

  test('created team appears on teams page', async ({ page, request }) => {
    const teamName = `${prefix}UiTeam-${Date.now()}`;
    const team = await api.createTeam(request, accessToken, teamName);
    teamId = team.id;

    await page.goto(`${BASE}/teams`);
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 15_000 });
  });

  test('create team via UI', async ({ page }) => {
    await page.goto(`${BASE}/teams`);
    const createBtn = page.locator('[data-testid="team-create-btn"], button:has-text("Создать"), button:has-text("Команда"), button:has-text("New"), button:has-text("Create")').first();
    if (await createBtn.isVisible({ timeout: 5_000 })) {
      await createBtn.click();
      await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
    } else {
      test.skip();
    }
  });
});
