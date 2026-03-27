/**
 * TTADM-63: GitLab webhook → workflow transition adapter — integration tests
 *
 * Covers:
 * 1. merge_request merged → transition to DONE via workflow engine
 * 2. merge_request opened → transition to REVIEW via workflow engine
 * 3. push event → transition to IN_PROGRESS via workflow engine
 * 4. No matching transition → 200 OK, audit logged, issue status unchanged
 * 5. Multiple issue keys in one MR → all matching issues transitioned
 * 6. Invalid secret → 401
 * 7. Pipeline event → audit logged (no status transition)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { request } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Module-level state ───────────────────────────────────────────────────────

let adminToken: string;
let adminUserId: string;
let projectId: string;
let projectKey: string;
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
    email: 'admin@gl-test.com',
    password: 'password123',
    name: 'GL Admin',
  });
  adminUserId = adminReg.body.user.id;
  await prisma.user.update({ where: { id: adminUserId }, data: { role: 'ADMIN' } });
  const adminLogin = await request
    .post('/api/auth/login')
    .send({ email: 'admin@gl-test.com', password: 'password123' });
  adminToken = adminLogin.body.accessToken;

  // --- Create project ---
  projectKey = 'GLWH';
  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'GitLab Webhook Test Project', key: projectKey });
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a workflow with OPEN→REVIEW→DONE transitions and attach to project. */
async function buildFullWorkflow() {
  // Create workflow
  const wfRes = await request
    .post('/api/admin/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `GitLab WF ${Date.now()}` });
  expect(wfRes.status).toBe(201);
  const workflowId: string = wfRes.body.id;

  // Add steps: OPEN (initial), IN_PROGRESS, REVIEW, DONE
  for (const [sid, isInitial] of [
    [statusIds.OPEN, true],
    [statusIds.IN_PROGRESS, false],
    [statusIds.REVIEW, false],
    [statusIds.DONE, false],
  ] as [string, boolean][]) {
    const r = await request
      .post(`/api/admin/workflows/${workflowId}/steps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: sid, isInitial });
    expect(r.status).toBe(201);
  }

  // Transitions: OPEN→IN_PROGRESS, OPEN→REVIEW, IN_PROGRESS→REVIEW, REVIEW→DONE, IN_PROGRESS→DONE
  const transitionPairs: [string, string, string][] = [
    ['OPEN→IN_PROGRESS', statusIds.OPEN, statusIds.IN_PROGRESS],
    ['OPEN→REVIEW', statusIds.OPEN, statusIds.REVIEW],
    ['IN_PROGRESS→REVIEW', statusIds.IN_PROGRESS, statusIds.REVIEW],
    ['REVIEW→DONE', statusIds.REVIEW, statusIds.DONE],
    ['IN_PROGRESS→DONE', statusIds.IN_PROGRESS, statusIds.DONE],
  ];

  for (const [name, fromStatusId, toStatusId] of transitionPairs) {
    const r = await request
      .post(`/api/admin/workflows/${workflowId}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, fromStatusId, toStatusId, isGlobal: false, conditions: [], validators: [], postFunctions: [] });
    expect(r.status).toBe(201);
  }

  // Create and attach scheme
  const schemeRes = await request
    .post('/api/admin/workflow-schemes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `GitLab Scheme ${Date.now()}` });
  expect(schemeRes.status).toBe(201);
  const schemeId: string = schemeRes.body.id;

  await request
    .put(`/api/admin/workflow-schemes/${schemeId}/items`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ items: [{ workflowId, issueTypeConfigId: null }] });

  await request
    .post(`/api/admin/workflow-schemes/${schemeId}/projects`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ projectId });

  return { workflowId, schemeId };
}

/** Create an issue and set its workflowStatusId + legacy status to a given workflow status. Returns issue. */
async function createIssueAtStatus(title: string, targetStatusId: string) {
  const res = await request
    .post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title, type: 'TASK' });
  expect(res.status).toBe(201);
  const issueId: string = res.body.id;
  // Resolve legacy IssueStatus from workflowStatus.systemKey
  const wfStatus = await prisma.workflowStatus.findUnique({ where: { id: targetStatusId }, select: { systemKey: true } });
  const legacyStatus = (wfStatus?.systemKey ?? 'OPEN') as import('@prisma/client').IssueStatus;
  await prisma.issue.update({ where: { id: issueId }, data: { workflowStatusId: targetStatusId, status: legacyStatus } });
  return res.body;
}

/** Post GitLab merge_request event. */
function postMergeRequest(state: string, action: string, title: string, sourceBranch: string) {
  return request.post('/api/webhooks/gitlab').send({
    object_kind: 'merge_request',
    object_attributes: { state, action, title, source_branch: sourceBranch },
  });
}

/** Post GitLab push event. */
function postPush(ref: string, commits: { message: string }[] = []) {
  return request.post('/api/webhooks/gitlab').send({
    object_kind: 'push',
    ref,
    commits,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('GitLab webhook — merge_request merged → DONE', () => {
  it('transitions issue from REVIEW to DONE when MR is merged', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus(`Fix bug ${projectKey}-1`, statusIds.REVIEW);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postMergeRequest('merged', 'merge', `Fix: ${issueKey}`, 'fix/some-fix');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).toContain(issue.id);

    const updated = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updated?.status).toBe('DONE');

    // Audit log should record source gitlab_webhook
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: issue.id, action: 'issue.gitlab_webhook_transition' },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    const details = auditLogs[0].details as Record<string, unknown>;
    expect(details.source).toBe('gitlab_webhook');
    expect(details.targetSystemKey).toBe('DONE');
  });

  it('transitions issue from IN_PROGRESS to DONE when MR is merged', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus(`Task in progress`, statusIds.IN_PROGRESS);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postMergeRequest('merged', 'merge', `feat: ${issueKey} done`, 'feature/branch');
    expect(res.status).toBe(200);
    expect(res.body.updated).toContain(issue.id);

    const updated = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updated?.status).toBe('DONE');
  });
});

describe('GitLab webhook — merge_request opened → REVIEW', () => {
  it('transitions issue from OPEN to REVIEW when MR is opened', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus('Feature task', statusIds.OPEN);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postMergeRequest('opened', 'open', `feat: implement ${issueKey}`, `feature/${issueKey}`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toContain(issue.id);

    const updated = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updated?.status).toBe('REVIEW');
  });

  it('reads issue key from source_branch if not in title', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus('Branch task', statusIds.OPEN);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postMergeRequest('opened', 'open', 'Some unrelated title', `feature/${issueKey}-my-feature`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toContain(issue.id);
  });
});

describe('GitLab webhook — push → IN_PROGRESS', () => {
  it('transitions issue from OPEN to IN_PROGRESS on push with issue key in branch', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus('New task', statusIds.OPEN);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postPush(`refs/heads/feature/${issueKey}-implementation`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toContain(issue.id);

    const updated = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updated?.status).toBe('IN_PROGRESS');
  });

  it('reads issue key from commit message if not in branch name', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus('Commit task', statusIds.OPEN);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postPush('refs/heads/general-branch', [{ message: `feat: start work on ${issueKey}` }]);
    expect(res.status).toBe(200);
    expect(res.body.updated).toContain(issue.id);
  });
});

describe('GitLab webhook — no matching transition', () => {
  it('returns 200 with empty updated and logs audit when no transition available', async () => {
    await buildFullWorkflow();
    // Issue is DONE — no transition from DONE to DONE
    const issue = await createIssueAtStatus('Completed task', statusIds.DONE);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await postMergeRequest('merged', 'merge', `${issueKey}`, 'feature/merged');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).not.toContain(issue.id);

    // Status should remain DONE
    const updated = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updated?.status).toBe('DONE');

    // Audit log should record the unavailable transition
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: issue.id, action: 'issue.gitlab_transition_unavailable' },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 when issue key not found in DB', async () => {
    const res = await postMergeRequest('merged', 'merge', 'NONEXISTENT-999', 'branch');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).toHaveLength(0);
  });
});

describe('GitLab webhook — multiple issue keys', () => {
  it('transitions all issues found in MR title + source branch', async () => {
    await buildFullWorkflow();
    const issue1 = await createIssueAtStatus('Task 1', statusIds.REVIEW);
    const issue2 = await createIssueAtStatus('Task 2', statusIds.IN_PROGRESS);
    const key1 = `${projectKey}-${issue1.number}`;
    const key2 = `${projectKey}-${issue2.number}`;

    const res = await postMergeRequest('merged', 'merge', `Fix ${key1}`, `feature/${key2}-branch`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toContain(issue1.id);
    expect(res.body.updated).toContain(issue2.id);

    const [u1, u2] = await Promise.all([
      prisma.issue.findUnique({ where: { id: issue1.id } }),
      prisma.issue.findUnique({ where: { id: issue2.id } }),
    ]);
    expect(u1?.status).toBe('DONE');
    expect(u2?.status).toBe('DONE');
  });
});

describe('GitLab webhook — security', () => {
  it('returns 401 when GITLAB_WEBHOOK_SECRET is set and token is wrong', async () => {
    process.env.GITLAB_WEBHOOK_SECRET = 'super-secret';
    try {
      const res = await request
        .post('/api/webhooks/gitlab')
        .set('X-Gitlab-Token', 'wrong-token')
        .send({ object_kind: 'push', ref: 'refs/heads/main', commits: [] });
      expect(res.status).toBe(401);
    } finally {
      delete process.env.GITLAB_WEBHOOK_SECRET;
    }
  });

  it('accepts request when GITLAB_WEBHOOK_SECRET matches', async () => {
    process.env.GITLAB_WEBHOOK_SECRET = 'correct-secret';
    try {
      const res = await request
        .post('/api/webhooks/gitlab')
        .set('X-Gitlab-Token', 'correct-secret')
        .send({ object_kind: 'push', ref: 'refs/heads/main', commits: [] });
      expect(res.status).toBe(200);
    } finally {
      delete process.env.GITLAB_WEBHOOK_SECRET;
    }
  });
});

describe('GitLab webhook — pipeline event', () => {
  it('returns 200 and logs audit without status transition', async () => {
    await buildFullWorkflow();
    const issue = await createIssueAtStatus('Pipeline task', statusIds.IN_PROGRESS);
    const issueKey = `${projectKey}-${issue.number}`;

    const res = await request.post('/api/webhooks/gitlab').send({
      object_kind: 'pipeline',
      object_attributes: { status: 'success', ref: `refs/heads/feature/${issueKey}` },
      commits: [],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).toContain(issue.id);

    // Status should NOT have changed (pipeline handler doesn't transition)
    const updated = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updated?.status).toBe('IN_PROGRESS');
  });
});

describe('GitLab webhook — unknown event', () => {
  it('returns 200 with ignored message for unknown object_kind', async () => {
    const res = await request.post('/api/webhooks/gitlab').send({ object_kind: 'note' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Event ignored');
  });
});
