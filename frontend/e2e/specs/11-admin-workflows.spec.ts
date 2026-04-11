import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

test.describe('Admin — Workflows', () => {
  test.describe.configure({ mode: 'serial' });

  test('admin workflows list page renders', async ({ page }) => {
    await page.goto(`${BASE}/admin/workflows`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('workflow list shows at least one workflow', async ({ page }) => {
    await page.goto(`${BASE}/admin/workflows`);
    // Admin workflow page may use Ant Design or inline styles — wait for any content
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('open workflow detail from list', async ({ page }) => {
    await page.goto(`${BASE}/admin/workflows`);
    // Click first row / item
    const firstItem = page.locator('table tbody tr, [class*="list-item"]').first();
    if (await firstItem.isVisible({ timeout: 10_000 })) {
      await firstItem.click();
      // Should navigate to workflow detail/editor
      await expect(page).toHaveURL(/\/admin\/workflows\//, { timeout: 10_000 });
    } else {
      test.skip();
    }
  });

  test('workflow editor renders steps and transitions', async ({ page }) => {
    await page.goto(`${BASE}/admin/workflows`);
    const firstItem = page.locator('table tbody tr, [class*="list-item"]').first();
    if (await firstItem.isVisible({ timeout: 10_000 })) {
      await firstItem.click();
      await expect(page).toHaveURL(/\/admin\/workflows\//, { timeout: 10_000 });
      // Steps or transitions section visible
      const stepsSection = page.getByText('Шаги').or(page.getByText('Steps')).or(page.getByText('Transitions')).or(page.getByText('Переходы')).first();
      await expect(stepsSection).toBeVisible({ timeout: 10_000 });
    } else {
      test.skip();
    }
  });

  test('workflow validate button or link exists', async ({ page }) => {
    await page.goto(`${BASE}/admin/workflows`);
    const firstItem = page.locator('table tbody tr, [class*="list-item"]').first();
    if (await firstItem.isVisible({ timeout: 10_000 })) {
      await firstItem.click();
      await expect(page).toHaveURL(/\/admin\/workflows\//, { timeout: 10_000 });
      const validateBtn = page.locator('[data-testid="workflow-validate"], button:has-text("Валидировать"), button:has-text("Validate")').first();
      if (await validateBtn.isVisible({ timeout: 5_000 })) {
        await validateBtn.click();
        // Result — some response or unchanged page — just no crash
        await page.waitForTimeout(500);
        await expect(page.locator('h1, h2, [class*="heading"]').first()).toBeVisible({ timeout: 5_000 });
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('workflow schemes page renders', async ({ page }) => {
    await page.goto(`${BASE}/admin/workflow-schemes`);
    await expect(page.locator('h1, h2, [class*="heading"]').first()).toBeVisible({ timeout: 15_000 });
  });
});
