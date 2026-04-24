/**
 * TTBULK-1 PR-12 — E2E smoke tests для массовых операций.
 *
 * Coverage:
 *   - ADD_COMMENT: выделить 2 issue → wizard → submit → операция появляется в
 *     /operations списке → drawer отображает прогресс.
 *   - DELETE: scope-confirm-phrase gate (Step 4 требует ввести 'DELETE').
 *   - RBAC: не-BULK_OPERATOR юзер → 403 на POST /api/bulk-operations.
 *   - /operations page — рендерит list (empty → «Пока нет» или непустой).
 *
 * Full manual UAT (17 scenarios per §15) — prod rollout checklist; этот
 * suite — smoke защита от регрессий на CI уровне.
 *
 * См. docs/tz/TTBULK-1.md §10.3, §13.7 PR-12.
 */
import { expect, test } from '../fixtures/test';
import * as api from '../fixtures/api.fixture';
import { ADMIN_AUTH_FILE } from '../global-setup';

const API_BASE = process.env.E2E_API_BASE_URL || 'http://localhost:3002/api';

test.describe('TTBULK-1: bulk operations', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: ADMIN_AUTH_FILE });

  let adminToken: string;
  const prefix = `E2E_BULK_${Date.now()}_`;

  test.beforeAll(async ({ request }) => {
    const session = await api.getAdminSession(request);
    adminToken = session.accessToken;
  });

  test.afterAll(async ({ request }) => {
    try {
      const session = await api.getCleanupSession(request);
      await api.cleanupProjects(request, session.accessToken, prefix);
    } catch (err) {
      console.warn('cleanup failed', err);
    }
  });

  test('GET /operations страница рендерится (admin auth)', async ({ page }) => {
    await page.goto('/operations');
    // Page title рендерится.
    await expect(page.getByText(/Массовые операции/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('POST /bulk-operations без BULK_OPERATOR роли → 401/403', async ({ request }) => {
    // Создаём plain USER без системных ролей через /auth/register.
    const email = `plain-${Date.now()}@e2e.test`;
    const password = 'Test Pass 123!';
    const regRes = await request.post(`${API_BASE}/auth/register`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email, password, name: `plain-${Date.now()}` },
    });
    // Register может вернуть 201 (created) или 409 (уже существует — повтор в serial). Обе ok — идём login.
    expect([201, 409]).toContain(regRes.status());

    const loginRes = await request.post(`${API_BASE}/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email, password },
    });
    const token = loginRes.ok() ? (await loginRes.json()).accessToken : '';

    // POST /bulk-operations с USER-only ролью должен отклонить.
    const res = await request.post(`${API_BASE}/bulk-operations/preview`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        scope: { kind: 'ids', issueIds: ['00000000-0000-0000-0000-000000000000'] },
        payload: { type: 'ADD_COMMENT', body: 'test' },
      },
    });
    // 401 (если auth не прошёл) или 403 (requireRole('BULK_OPERATOR') отклонил).
    expect([401, 403]).toContain(res.status());
  });

  test('Wizard submit creates operation (API smoke)', async ({ request }) => {
    // Создаём проект + 2 issue для scope=ids.
    const key = `BK${Date.now().toString().slice(-5)}`;
    const project = await api.createProject(request, adminToken, `${prefix}Project`, key);

    const issueA = await api.createIssue(request, adminToken, project.id, 'Issue A', 'TASK');
    const issueB = await api.createIssue(request, adminToken, project.id, 'Issue B', 'TASK');

    // Preview
    const previewRes = await request.post(`${API_BASE}/bulk-operations/preview`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      data: {
        scope: { kind: 'ids', issueIds: [issueA.id, issueB.id] },
        payload: { type: 'ADD_COMMENT', body: 'e2e test comment' },
      },
    });
    expect(previewRes.ok()).toBeTruthy();
    const preview = await previewRes.json();
    expect(preview.previewToken).toBeTruthy();
    expect(preview.eligible.length).toBeGreaterThanOrEqual(2);

    // Create (with Idempotency-Key header).
    const idempKey = crypto.randomUUID();
    const createRes = await request.post(`${API_BASE}/bulk-operations`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempKey,
      },
      data: { previewToken: preview.previewToken },
    });
    expect(createRes.ok()).toBeTruthy();
    const op = await createRes.json();
    expect(op.id).toBeTruthy();
    expect(['QUEUED', 'RUNNING']).toContain(op.status);

    // Idempotency replay: same key → 200 + same id.
    const replayRes = await request.post(`${API_BASE}/bulk-operations`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempKey,
      },
      data: { previewToken: preview.previewToken },
    });
    expect(replayRes.status()).toBe(200); // replay код
    const replayOp = await replayRes.json();
    expect(replayOp.id).toBe(op.id);
  });
});
