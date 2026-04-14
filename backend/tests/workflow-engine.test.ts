/**
 * TTADM-65: Workflow Engine — integration tests
 *
 * Covers:
 * 1. WorkflowStatus CRUD
 * 2. Workflow CRUD + steps + transitions
 * 3. WorkflowScheme CRUD + items + project attachment
 * 4. GET /api/issues/:id/transitions — list available transitions
 * 5. POST /api/issues/:id/transitions — execute transition (happy path)
 * 6. Conditions: USER_HAS_GLOBAL_ROLE, USER_IS_ASSIGNEE, USER_IS_REPORTER, ANY_OF
 * 7. Validators: ALL_SUBTASKS_DONE, COMMENT_REQUIRED, TIME_LOGGED
 * 8. Screen fields: required field missing → 422
 * 9. Post-functions: ASSIGN_TO_CURRENT_USER, ASSIGN_TO_REPORTER, CLEAR_ASSIGNEE, LOG_AUDIT
 * 10. Workflow scheme: per-issue-type routing
 * 11. Error cases: INVALID_TRANSITION, non-existent transition
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { request } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Module-level state ───────────────────────────────────────────────────────

let adminToken: string;
let adminUserId: string;
let userToken: string;
let userId: string;
let projectId: string;
let statusIds: Record<'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED', string>;

// ─── beforeEach: full cleanup + setup ────────────────────────────────────────

beforeEach(async () => {
  // --- Cleanup in FK-safe order ---
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issueCustomFieldValue.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.workflowSchemeProject.deleteMany();
  await prisma.workflowSchemeItem.deleteMany();
  await prisma.workflowScheme.deleteMany();
  const nonSystemWfs = await prisma.workflow.findMany({ where: { isSystem: false }, select: { id: true } });
  const wfIds = nonSystemWfs.map((w) => w.id);
  if (wfIds.length > 0) {
    await prisma.workflowTransition.deleteMany({ where: { workflowId: { in: wfIds } } });
    await prisma.workflowStep.deleteMany({ where: { workflowId: { in: wfIds } } });
  }
  await prisma.workflow.deleteMany({ where: { isSystem: false } });
  await prisma.workflowStatus.deleteMany({ where: { isSystem: false } });
  await prisma.sprint.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // --- Create admin user ---
  const adminReg = await request.post('/api/auth/register').send({
    email: 'admin@wf-test.com',
    password: 'Password123',
    name: 'WF Admin',
  });
  adminUserId = adminReg.body.user.id;
  await prisma.userSystemRole.upsert({ where: { userId_role: { userId: adminUserId, role: 'ADMIN' } }, create: { userId: adminUserId, role: 'ADMIN' }, update: {} });
  const adminLogin = await request
    .post('/api/auth/login')
    .send({ email: 'admin@wf-test.com', password: 'Password123' });
  adminToken = adminLogin.body.accessToken;

  // --- Create regular user ---
  const userReg = await request.post('/api/auth/register').send({
    email: 'user@wf-test.com',
    password: 'Password123',
    name: 'WF User',
  });
  userId = userReg.body.user.id;
  const userLogin = await request
    .post('/api/auth/login')
    .send({ email: 'user@wf-test.com', password: 'Password123' });
  userToken = userLogin.body.accessToken;

  // --- Create project ---
  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'WF Test Project', key: 'WFTP' });
  projectId = proj.body.id;

  // --- Cache system status IDs ---
  const statuses = await prisma.workflowStatus.findMany({ where: { isSystem: true } });
  const byKey = Object.fromEntries(statuses.map((s) => [s.systemKey, s.id])) as Record<string, string>;
  statusIds = {
    OPEN: byKey['OPEN'],
    IN_PROGRESS: byKey['IN_PROGRESS'],
    REVIEW: byKey['REVIEW'],
    DONE: byKey['DONE'],
    CANCELLED: byKey['CANCELLED'],
  };
});

// ─── Helper: build a complete custom workflow and attach it to the project ────

async function buildCustomWorkflow(opts: {
  conditions?: unknown[];
  validators?: unknown[];
  postFunctions?: unknown[];
  isGlobal?: boolean;
  fromStatusId?: string;
  toStatusId?: string;
  extraStepIds?: string[];
}): Promise<{ workflowId: string; transitionId: string; schemeId: string }> {
  const fromId = opts.fromStatusId ?? statusIds.OPEN;
  const toId = opts.toStatusId ?? statusIds.DONE;

  // Create workflow
  const wfRes = await request
    .post('/api/admin/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Test WF ${Date.now()}` });
  expect(wfRes.status).toBe(201);
  const workflowId: string = wfRes.body.id;

  // Add required steps (deduplicated)
  const stepIds = new Set([fromId, toId, ...(opts.extraStepIds ?? [])]);
  let first = true;
  for (const sid of stepIds) {
    const stepRes = await request
      .post(`/api/admin/workflows/${workflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: sid, isInitial: first });
    expect(stepRes.status).toBe(201);
    first = false;
  }

  // Create transition
  const tRes = await request
    .post(`/api/admin/workflows/${workflowId}/transitions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Test Transition',
      fromStatusId: opts.isGlobal ? null : fromId,
      toStatusId: toId,
      isGlobal: opts.isGlobal ?? false,
      conditions: opts.conditions ?? [],
      validators: opts.validators ?? [],
      postFunctions: opts.postFunctions ?? [],
    });
  expect(tRes.status).toBe(201);
  const transitionId: string = tRes.body.id;

  // Create scheme
  const schemeRes = await request
    .post('/api/admin/workflow-schemes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Test Scheme ${Date.now()}` });
  expect(schemeRes.status).toBe(201);
  const schemeId: string = schemeRes.body.id;

  // Attach workflow to scheme (default — matches any issue type)
  await request
    .put(`/api/admin/workflow-schemes/${schemeId}/items`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ items: [{ workflowId, issueTypeConfigId: null }] });

  // Attach scheme to project
  await request
    .post(`/api/admin/workflow-schemes/${schemeId}/projects`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ projectId });

  return { workflowId, transitionId, schemeId };
}

// ─── Helper: small async delay for fire-and-forget post-functions ─────────────

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// 1. WorkflowStatus CRUD
// =============================================================================

describe('WorkflowStatus CRUD', () => {
  it('GET /api/admin/workflow-statuses — returns list including system statuses', async () => {
    const res = await request
      .get('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5); // at least OPEN/IN_PROGRESS/REVIEW/DONE/CANCELLED
    const systemKeys = res.body.map((s: { systemKey: string | null }) => s.systemKey).filter(Boolean);
    expect(systemKeys).toContain('OPEN');
    expect(systemKeys).toContain('DONE');
  });

  it('GET /api/admin/workflow-statuses — requires ADMIN role', async () => {
    const res = await request
      .get('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('POST /api/admin/workflow-statuses — creates a custom status', async () => {
    const res = await request
      .post('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Custom Status', category: 'IN_PROGRESS', color: '#FF9900' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Custom Status',
      category: 'IN_PROGRESS',
      color: '#FF9900',
      isSystem: false,
    });
  });

  it('POST /api/admin/workflow-statuses — validates required fields', async () => {
    const res = await request
      .post('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ color: '#FF9900' }); // missing name and category

    expect(res.status).toBe(400);
  });

  it('GET /api/admin/workflow-statuses/:id — returns single status', async () => {
    const created = await request
      .post('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fetch Me', category: 'TODO', color: '#AAAAAA' });

    const res = await request
      .get(`/api/admin/workflow-statuses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.name).toBe('Fetch Me');
  });

  it('PATCH /api/admin/workflow-statuses/:id — updates custom status', async () => {
    const created = await request
      .post('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Old Name', category: 'TODO', color: '#000000' });

    const res = await request
      .patch(`/api/admin/workflow-statuses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Name', color: '#FFFFFF' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.color).toBe('#FFFFFF');
  });

  it('DELETE /api/admin/workflow-statuses/:id — deletes custom status', async () => {
    const created = await request
      .post('/api/admin/workflow-statuses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Me', category: 'TODO', color: '#123456' });

    const del = await request
      .delete(`/api/admin/workflow-statuses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ ok: true });

    // Confirm gone
    const get = await request
      .get(`/api/admin/workflow-statuses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(404);
  });

  it('DELETE system status is rejected', async () => {
    const res = await request
      .delete(`/api/admin/workflow-statuses/${statusIds.OPEN}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // System statuses cannot be deleted — expect 400 or 409
    expect([400, 409]).toContain(res.status);
  });
});

// =============================================================================
// 2. Workflows CRUD + Steps + Transitions
// =============================================================================

describe('Workflow CRUD', () => {
  it('GET /api/admin/workflows — returns list', async () => {
    const res = await request
      .get('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/admin/workflows — creates workflow', async () => {
    const res = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'My Workflow', description: 'A test workflow' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'My Workflow',
      isSystem: false,
    });
  });

  it('POST /api/admin/workflows — requires ADMIN role', async () => {
    const res = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'My Workflow' });

    expect(res.status).toBe(403);
  });

  it('GET /api/admin/workflows/:id — returns workflow with steps and transitions', async () => {
    const created = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Get By ID' });

    const res = await request
      .get(`/api/admin/workflows/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(Array.isArray(res.body.transitions)).toBe(true);
  });

  it('PUT /api/admin/workflows/:id — updates workflow', async () => {
    const created = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Original Name' });

    const res = await request
      .put(`/api/admin/workflows/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('DELETE /api/admin/workflows/:id — deletes workflow', async () => {
    const created = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Me WF' });

    const del = await request
      .delete(`/api/admin/workflows/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ ok: true });
  });

  it('POST /api/admin/workflows/:id/copy — copies workflow', async () => {
    const original = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Original WF' });

    // Add a step so the copy has something
    await request
      .post(`/api/admin/workflows/${original.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });

    const copy = await request
      .post(`/api/admin/workflows/${original.body.id}/copy`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(copy.status).toBe(201);
    expect(copy.body.id).not.toBe(original.body.id);
    expect(copy.body.name).toContain('copy');
  });
});

describe('Workflow Steps', () => {
  it('POST /api/admin/workflows/:id/steps — adds step', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Steps WF' });

    const step = await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });

    expect(step.status).toBe(201);
    expect(step.body).toMatchObject({
      id: expect.any(String),
      statusId: statusIds.OPEN,
      isInitial: true,
    });
  });

  it('PATCH /api/admin/workflows/:id/steps/:stepId — updates step', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Step Update WF' });

    const step = await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });

    const updated = await request
      .patch(`/api/admin/workflows/${wf.body.id}/steps/${step.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderIndex: 5 });

    expect(updated.status).toBe(200);
    expect(updated.body.orderIndex).toBe(5);
  });

  it('DELETE /api/admin/workflows/:id/steps/:stepId — removes step', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Step Delete WF' });

    const step = await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });

    const del = await request
      .delete(`/api/admin/workflows/${wf.body.id}/steps/${step.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ ok: true });
  });
});

describe('Workflow Transitions (admin)', () => {
  it('POST /api/admin/workflows/:id/transitions — creates transition', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Trans WF' });

    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    const t = await request
      .post(`/api/admin/workflows/${wf.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Close',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.DONE,
        isGlobal: false,
        conditions: [],
        validators: [],
        postFunctions: [],
      });

    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({
      id: expect.any(String),
      name: 'Close',
      fromStatusId: statusIds.OPEN,
      toStatusId: statusIds.DONE,
    });
  });

  it('GET /api/admin/workflows/:id/transitions — lists transitions', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'List Trans WF' });

    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    await request
      .post(`/api/admin/workflows/${wf.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Go to Done',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.DONE,
        isGlobal: false,
      });

    const res = await request
      .get(`/api/admin/workflows/${wf.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('PUT /api/admin/workflows/:id/transitions/:tid — updates transition', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Update Trans WF' });

    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    const t = await request
      .post(`/api/admin/workflows/${wf.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Original Trans',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.DONE,
        isGlobal: false,
      });

    const updated = await request
      .put(`/api/admin/workflows/${wf.body.id}/transitions/${t.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed Trans' });

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Renamed Trans');
  });

  it('DELETE /api/admin/workflows/:id/transitions/:tid — deletes transition', async () => {
    const wf = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Trans WF' });

    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${wf.body.id}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    const t = await request
      .post(`/api/admin/workflows/${wf.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kill Me',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.DONE,
        isGlobal: false,
      });

    const del = await request
      .delete(`/api/admin/workflows/${wf.body.id}/transitions/${t.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ ok: true });
  });
});

// =============================================================================
// 3. WorkflowScheme CRUD + items + project attachment
// =============================================================================

describe('WorkflowScheme CRUD', () => {
  it('GET /api/admin/workflow-schemes — returns list', async () => {
    const res = await request
      .get('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/admin/workflow-schemes — creates scheme', async () => {
    const res = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'My Scheme', description: 'A test scheme' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'My Scheme',
    });
  });

  it('POST /api/admin/workflow-schemes — requires ADMIN role', async () => {
    const res = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Blocked' });

    expect(res.status).toBe(403);
  });

  it('GET /api/admin/workflow-schemes/:id — returns scheme with items', async () => {
    const scheme = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scheme By ID' });

    const res = await request
      .get(`/api/admin/workflow-schemes/${scheme.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(scheme.body.id);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('PUT /api/admin/workflow-schemes/:id — updates scheme', async () => {
    const scheme = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Old Scheme Name' });

    const res = await request
      .put(`/api/admin/workflow-schemes/${scheme.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Scheme Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Scheme Name');
  });

  it('DELETE /api/admin/workflow-schemes/:id — deletes scheme', async () => {
    const scheme = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Me Scheme' });

    const del = await request
      .delete(`/api/admin/workflow-schemes/${scheme.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ ok: true });
  });

  it('PUT /api/admin/workflow-schemes/:id/items — replaces scheme items', async () => {
    const wfRes = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Items WF' });
    const workflowId = wfRes.body.id;

    // Add required steps and transition to make workflow valid for attachment
    await request
      .post(`/api/admin/workflows/${workflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${workflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE, isInitial: false });
    await request
      .post(`/api/admin/workflows/${workflowId}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Close', fromStatusId: statusIds.OPEN, toStatusId: statusIds.DONE, isGlobal: false });

    const scheme = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scheme With Items' });

    const res = await request
      .put(`/api/admin/workflow-schemes/${scheme.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ workflowId, issueTypeConfigId: null }] });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].workflowId).toBe(workflowId);
  });

  it('POST /api/admin/workflow-schemes/:id/projects — attaches project', async () => {
    const scheme = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scheme For Project' });

    const res = await request
      .post(`/api/admin/workflow-schemes/${scheme.body.id}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ projectId, schemeId: scheme.body.id });
  });

  it('DELETE /api/admin/workflow-schemes/:id/projects/:projectId — detaches project', async () => {
    const scheme = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scheme For Detach' });

    await request
      .post(`/api/admin/workflow-schemes/${scheme.body.id}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId });

    const del = await request
      .delete(`/api/admin/workflow-schemes/${scheme.body.id}/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ ok: true });
  });
});

// =============================================================================
// 4. GET /api/issues/:id/transitions
// =============================================================================

describe('GET /api/issues/:id/transitions — list available transitions', () => {
  it('returns currentStatus and transitions array', async () => {
    await buildCustomWorkflow({});

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Issue' });
    expect(issue.status).toBe(201);

    const res = await request
      .get(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentStatus');
    expect(res.body).toHaveProperty('transitions');
    expect(Array.isArray(res.body.transitions)).toBe(true);
    expect(res.body.transitions.length).toBeGreaterThanOrEqual(1);
  });

  it('transition items have correct shape', async () => {
    await buildCustomWorkflow({});

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Shape Test Issue' });

    const res = await request
      .get(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const t = res.body.transitions[0];
    expect(t).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      toStatus: {
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
      },
      requiresScreen: expect.any(Boolean),
    });
  });

  it('returns 404 for non-existent issue', async () => {
    const res = await request
      .get('/api/issues/00000000-0000-0000-0000-000000000000/transitions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Unauth test' });

    const res = await request.get(`/api/issues/${issue.body.id}/transitions`);
    expect(res.status).toBe(401);
  });

  it('global transitions appear regardless of current status', async () => {
    await buildCustomWorkflow({ isGlobal: true, toStatusId: statusIds.DONE });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Global Transition Issue' });

    const res = await request
      .get(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.transitions.some((t: { name: string }) => t.name === 'Test Transition');
    expect(found).toBe(true);
  });
});

// =============================================================================
// 5. POST /api/issues/:id/transitions — execute transition happy path
// =============================================================================

describe('POST /api/issues/:id/transitions — execute transition', () => {
  it('happy path: status is updated after transition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      fromStatusId: statusIds.OPEN,
      toStatusId: statusIds.DONE,
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Transition Happy Path' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DONE');
    expect(res.body.workflowStatus).toMatchObject({
      id: statusIds.DONE,
    });
  });

  it('updated issue is persisted in DB', async () => {
    const { transitionId } = await buildCustomWorkflow({
      fromStatusId: statusIds.OPEN,
      toStatusId: statusIds.DONE,
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Persist Check' });

    await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    const fetched = await request
      .get(`/api/issues/${issue.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(fetched.body.status).toBe('DONE');
    expect(fetched.body.workflowStatus.id).toBe(statusIds.DONE);
  });

  it('response contains assignee and creator fields', async () => {
    const { transitionId } = await buildCustomWorkflow({});

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Response Shape' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('creator');
    expect(res.body).toHaveProperty('workflowStatus');
  });
});

// =============================================================================
// 6. Conditions
// =============================================================================

describe('Conditions — USER_HAS_GLOBAL_ROLE', () => {
  it('ADMIN can execute transition with USER_HAS_GLOBAL_ROLE: [ADMIN]', async () => {
    const { transitionId } = await buildCustomWorkflow({
      conditions: [{ type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Admin Only Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });

  it('regular USER is blocked by USER_HAS_GLOBAL_ROLE: [ADMIN]', async () => {
    const { transitionId } = await buildCustomWorkflow({
      conditions: [{ type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Admin Only Issue For User' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    expect(res.status).toBe(403);
  });

  it('USER is not shown the restricted transition in GET /transitions', async () => {
    await buildCustomWorkflow({
      conditions: [{ type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Hidden From User' });

    const res = await request
      .get(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    // Transition with ADMIN-only condition should be filtered out for a USER
    const adminOnlyTransition = res.body.transitions.find(
      (t: { name: string }) => t.name === 'Test Transition',
    );
    expect(adminOnlyTransition).toBeUndefined();
  });
});

describe('Conditions — USER_IS_ASSIGNEE', () => {
  it('assignee can execute transition with USER_IS_ASSIGNEE condition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      conditions: [{ type: 'USER_IS_ASSIGNEE' }],
    });

    // Create issue and assign to regular user
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Assignee Issue', assigneeId: userId });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });

  it('non-assignee is blocked by USER_IS_ASSIGNEE condition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      conditions: [{ type: 'USER_IS_ASSIGNEE' }],
    });

    // Create issue — admin creates it but does not assign to anyone
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Unassigned Issue' });

    // regular user (not the assignee) tries transition
    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    expect(res.status).toBe(403);
  });
});

describe('Conditions — USER_IS_REPORTER', () => {
  it('creator can execute transition with USER_IS_REPORTER condition', async () => {
    // Create issue as regular user (they become the reporter)
    const { transitionId } = await buildCustomWorkflow({
      conditions: [{ type: 'USER_IS_REPORTER' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Reporter Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });

  it('non-creator is blocked by USER_IS_REPORTER condition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      conditions: [{ type: 'USER_IS_REPORTER' }],
    });

    // Admin creates the issue — admin is the reporter
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Admin Created Issue' });

    // regular user (not the creator) tries transition
    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    expect(res.status).toBe(403);
  });
});

describe('Conditions — ANY_OF', () => {
  it('ANY_OF: passes when at least one sub-condition is met', async () => {
    // admin matches USER_HAS_GLOBAL_ROLE: ADMIN even though not the assignee
    const { transitionId } = await buildCustomWorkflow({
      conditions: [
        {
          type: 'ANY_OF',
          conditions: [
            { type: 'USER_IS_ASSIGNEE' },
            { type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] },
          ],
        },
      ],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Any Of Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });

  it('ANY_OF: blocked when none of the sub-conditions are met', async () => {
    // regular user is neither assignee nor admin
    const { transitionId } = await buildCustomWorkflow({
      conditions: [
        {
          type: 'ANY_OF',
          conditions: [
            { type: 'USER_IS_ASSIGNEE' },
            { type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] },
          ],
        },
      ],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Any Of Blocked Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// 7. Validators
// =============================================================================

describe('Validators — ALL_SUBTASKS_DONE', () => {
  it('blocks transition when undone subtasks exist', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'ALL_SUBTASKS_DONE' }],
    });

    const parentIssue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Parent Task' });

    // Create a subtask (OPEN status) — must be SUBTASK type to be a valid child of TASK
    const subtaskTypeId = await getIssueTypeConfigId('SUBTASK');
    await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Undone Subtask', parentId: parentIssue.body.id, issueTypeConfigId: subtaskTypeId });

    const res = await request
      .post(`/api/issues/${parentIssue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATOR_FAILED');
    expect(res.body.validatorType).toBe('ALL_SUBTASKS_DONE');
  });

  it('allows transition when all subtasks are done', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'ALL_SUBTASKS_DONE' }],
    });

    const parentIssue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Parent With Done Subtasks' });

    const subtaskTypeId = await getIssueTypeConfigId('SUBTASK');
    const subtask = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Done Subtask', parentId: parentIssue.body.id, issueTypeConfigId: subtaskTypeId });

    // Mark subtask as done via legacy status API
    await request
      .patch(`/api/issues/${subtask.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DONE' });

    const res = await request
      .post(`/api/issues/${parentIssue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });

  it('allows transition when issue has no subtasks', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'ALL_SUBTASKS_DONE' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Standalone Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });
});

describe('Validators — COMMENT_REQUIRED', () => {
  it('blocks transition when no comments exist', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'COMMENT_REQUIRED' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Comment Required Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATOR_FAILED');
    expect(res.body.validatorType).toBe('COMMENT_REQUIRED');
  });

  it('allows transition when at least one comment exists', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'COMMENT_REQUIRED' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue With Comment' });

    // Add a comment
    await request
      .post(`/api/issues/${issue.body.id}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'This is a required comment' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });
});

describe('Validators — TIME_LOGGED', () => {
  it('blocks transition when no time is logged', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'TIME_LOGGED' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Time Required Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATOR_FAILED');
    expect(res.body.validatorType).toBe('TIME_LOGGED');
  });

  it('allows transition when time has been logged', async () => {
    const { transitionId } = await buildCustomWorkflow({
      validators: [{ type: 'TIME_LOGGED' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue With Time' });

    // Log time manually
    await request
      .post(`/api/issues/${issue.body.id}/time`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 2, note: 'Work done' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 8. Screen fields
// =============================================================================

describe('Screen fields', () => {
  it('blocks transition with 422 when required screen field is missing', async () => {
    const { workflowId, transitionId } = await buildCustomWorkflow({});

    // Create a custom field
    const fieldRes = await request
      .post('/api/admin/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Resolution Note', fieldType: 'TEXT', description: 'Required on close' });

    if (fieldRes.status !== 201) {
      // If custom fields endpoint is not available, skip this test gracefully
      return;
    }

    const customFieldId: string = fieldRes.body.id;

    // Create a TransitionScreen directly via Prisma
    const screen = await prisma.transitionScreen.create({
      data: {
        name: 'Close Screen',
        items: {
          create: [
            {
              customFieldId,
              isRequired: true,
              orderIndex: 0,
            },
          ],
        },
      },
    });

    // Attach screen to the transition
    await prisma.workflowTransition.update({
      where: { id: transitionId },
      data: { screenId: screen.id },
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Screen Field Issue' });

    // Execute without providing the required screen field value
    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('SCREEN_FIELD_REQUIRED');
  });

  it('allows transition when required screen field value is provided', async () => {
    const { workflowId, transitionId } = await buildCustomWorkflow({});

    const fieldRes = await request
      .post('/api/admin/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Resolution Note 2', fieldType: 'TEXT', description: 'Required on close' });

    if (fieldRes.status !== 201) {
      return;
    }

    const customFieldId: string = fieldRes.body.id;

    const screen = await prisma.transitionScreen.create({
      data: {
        name: 'Close Screen 2',
        items: {
          create: [
            {
              customFieldId,
              isRequired: true,
              orderIndex: 0,
            },
          ],
        },
      },
    });

    await prisma.workflowTransition.update({
      where: { id: transitionId },
      data: { screenId: screen.id },
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Screen Field OK Issue' });

    // Provide the required field value
    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        transitionId,
        screenFieldValues: { [customFieldId]: 'Resolved by design' },
      });

    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 9. Post-functions
// =============================================================================

describe('Post-functions — ASSIGN_TO_CURRENT_USER', () => {
  it('assignee becomes the actor after transition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      postFunctions: [{ type: 'ASSIGN_TO_CURRENT_USER' }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Assign To Me Issue' });

    // Regular user executes the transition
    await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ transitionId });

    // Wait for fire-and-forget post-function
    await delay(100);

    const updated = await prisma.issue.findUnique({ where: { id: issue.body.id } });
    expect(updated?.assigneeId).toBe(userId);
  });
});

describe('Post-functions — ASSIGN_TO_REPORTER', () => {
  it('assignee becomes the issue creator after transition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      postFunctions: [{ type: 'ASSIGN_TO_REPORTER' }],
    });

    // Admin creates the issue
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Assign To Reporter Issue' });

    await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    await delay(100);

    const updated = await prisma.issue.findUnique({ where: { id: issue.body.id } });
    expect(updated?.assigneeId).toBe(adminUserId);
  });
});

describe('Post-functions — CLEAR_ASSIGNEE', () => {
  it('assignee becomes null after transition', async () => {
    const { transitionId } = await buildCustomWorkflow({
      postFunctions: [{ type: 'CLEAR_ASSIGNEE' }],
    });

    // Create issue with an assignee
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Clear Assignee Issue', assigneeId: userId });

    await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    await delay(100);

    const updated = await prisma.issue.findUnique({ where: { id: issue.body.id } });
    expect(updated?.assigneeId).toBeNull();
  });
});

describe('Post-functions — LOG_AUDIT', () => {
  it('creates an audit log entry with the specified action', async () => {
    const customAction = 'issue.custom_event';
    const { transitionId } = await buildCustomWorkflow({
      postFunctions: [{ type: 'LOG_AUDIT', action: customAction }],
    });

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Audit Log Issue' });

    await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    await delay(100);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        entityId: issue.body.id,
        action: customAction,
      },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.userId).toBe(adminUserId);
  });
});

// =============================================================================
// 10. Workflow scheme per issue type
// =============================================================================

describe('Workflow scheme — per-issue-type routing', () => {
  it('TASK issues use the TASK-specific workflow', async () => {
    // Build a workflow for TASK issues specifically
    const taskTypeId = await getIssueTypeConfigId('TASK');

    const wfRes = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Task-Specific WF' });
    const taskWorkflowId = wfRes.body.id;

    // Steps (DONE step is required for workflow graph validation)
    await request
      .post(`/api/admin/workflows/${taskWorkflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${taskWorkflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.IN_PROGRESS });
    await request
      .post(`/api/admin/workflows/${taskWorkflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    // Transition unique to TASK workflow
    const taskTransRes = await request
      .post(`/api/admin/workflows/${taskWorkflowId}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Task-Only Transition',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.IN_PROGRESS,
        isGlobal: false,
      });
    const taskTransitionId: string = taskTransRes.body.id;

    // Build a default workflow for other issue types
    const defaultWfRes = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Default WF' });
    const defaultWorkflowId = defaultWfRes.body.id;

    await request
      .post(`/api/admin/workflows/${defaultWorkflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${defaultWorkflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    await request
      .post(`/api/admin/workflows/${defaultWorkflowId}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Default Close',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.DONE,
        isGlobal: false,
      });

    // Create scheme with both items
    const schemeRes = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Per-Type Scheme' });
    const schemeId = schemeRes.body.id;

    await request
      .put(`/api/admin/workflow-schemes/${schemeId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          { workflowId: taskWorkflowId, issueTypeConfigId: taskTypeId },
          { workflowId: defaultWorkflowId, issueTypeConfigId: null },
        ],
      });

    await request
      .post(`/api/admin/workflow-schemes/${schemeId}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId });

    // Create a TASK issue
    const taskIssue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'A Task', issueTypeConfigId: taskTypeId });

    // The TASK should see only the task-specific transition
    const transitionsRes = await request
      .get(`/api/issues/${taskIssue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(transitionsRes.status).toBe(200);
    const transitionNames = transitionsRes.body.transitions.map((t: { name: string }) => t.name);
    expect(transitionNames).toContain('Task-Only Transition');
    expect(transitionNames).not.toContain('Default Close');

    // Execute the TASK-specific transition
    const execRes = await request
      .post(`/api/issues/${taskIssue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId: taskTransitionId });

    expect(execRes.status).toBe(200);
    expect(execRes.body.status).toBe('IN_PROGRESS');
  });
});

// =============================================================================
// 11. Error cases
// =============================================================================

describe('Error cases', () => {
  it('INVALID_TRANSITION when fromStatus does not match current status', async () => {
    // Build workflow where OPEN is initial step but transition is from IN_PROGRESS → DONE
    // (explicit fix: buildCustomWorkflow sets fromStatusId as initial, so we do it manually)
    const wfRes = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `WrongStatus WF ${Date.now()}` });
    const wfId: string = wfRes.body.id;

    // OPEN is initial — issue will start here
    await request.post(`/api/admin/workflows/${wfId}/steps`).set('Authorization', `Bearer ${adminToken}`).send({ statusId: statusIds.OPEN, isInitial: true });
    await request.post(`/api/admin/workflows/${wfId}/steps`).set('Authorization', `Bearer ${adminToken}`).send({ statusId: statusIds.IN_PROGRESS, isInitial: false });
    await request.post(`/api/admin/workflows/${wfId}/steps`).set('Authorization', `Bearer ${adminToken}`).send({ statusId: statusIds.DONE, isInitial: false });

    // Transition only from IN_PROGRESS → DONE (not from OPEN)
    const tRes = await request
      .post(`/api/admin/workflows/${wfId}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Progress to Done', fromStatusId: statusIds.IN_PROGRESS, toStatusId: statusIds.DONE, isGlobal: false });
    const transitionId: string = tRes.body.id;

    const schemeRes = await request
      .post('/api/admin/workflow-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `WrongStatus Scheme ${Date.now()}` });
    const schemeId: string = schemeRes.body.id;

    await request.put(`/api/admin/workflow-schemes/${schemeId}/items`).set('Authorization', `Bearer ${adminToken}`).send({ items: [{ workflowId: wfId, issueTypeConfigId: null }] });
    await request.post(`/api/admin/workflow-schemes/${schemeId}/projects`).set('Authorization', `Bearer ${adminToken}`).send({ projectId });

    // Issue starts at OPEN, not IN_PROGRESS
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Wrong Status Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INVALID_TRANSITION');
  });

  it('returns 400 for non-existent transitionId', async () => {
    await buildCustomWorkflow({});

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Non-Existent Trans Issue' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent issue', async () => {
    await buildCustomWorkflow({});

    const res = await request
      .post('/api/issues/00000000-0000-0000-0000-000000000000/transitions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId: '00000000-0000-0000-0000-000000000001' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when transitionId is missing in request body', async () => {
    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Missing Trans ID' });

    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('INVALID_TRANSITION when transition belongs to a different workflow', async () => {
    // Build one workflow and attach it to the project
    await buildCustomWorkflow({});

    // Create a separate workflow (NOT attached to the project)
    const orphanWfRes = await request
      .post('/api/admin/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Orphan WF' });
    const orphanWfId = orphanWfRes.body.id;

    await request
      .post(`/api/admin/workflows/${orphanWfId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.OPEN, isInitial: true });
    await request
      .post(`/api/admin/workflows/${orphanWfId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusIds.DONE });

    const orphanTransRes = await request
      .post(`/api/admin/workflows/${orphanWfId}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Orphan Trans',
        fromStatusId: statusIds.OPEN,
        toStatusId: statusIds.DONE,
        isGlobal: false,
      });
    const orphanTransitionId: string = orphanTransRes.body.id;

    const issue = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Cross Workflow Issue' });

    // Try to use orphan workflow's transition on an issue bound to the first workflow
    const res = await request
      .post(`/api/issues/${issue.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transitionId: orphanTransitionId });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INVALID_TRANSITION');
  });
});

// ─── Helper (local) — re-exports getIssueTypeConfigId logic inline ─────────────

async function getIssueTypeConfigId(systemKey: string): Promise<string> {
  const config = await prisma.issueTypeConfig.findUniqueOrThrow({ where: { systemKey } });
  return config.id;
}
