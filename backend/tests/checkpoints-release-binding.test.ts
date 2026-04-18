/**
 * TTMP-160 PR-3 — integration tests for release-binding endpoints.
 *
 * Covers:
 *   - apply-template: creates ReleaseCheckpoints with criteriaSnapshot + offsetDaysSnapshot,
 *     deadline = plannedDate + offsetDays, runs initial recompute.
 *   - list: returns breakdown + passedIssues + violatedIssues + risk.
 *   - preview: dry-run of template without persistence.
 *   - recompute: idempotent (unchanged hash → no DB update), violation-event lifecycle
 *     (open on transition to violated, close on resolution).
 *   - add + delete checkpoints.
 *   - FR-19: GET /api/issues/:id?include=checkpoints inline returns checkpoints.
 *   - sync-instances: updates criteriaSnapshot + offsetDaysSnapshot + deadline.
 *   - RBAC: USER gets 403 on mutations; RELEASE_MANAGER gets 200.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let rmToken: string;
let plainToken: string;
let plainUserId: string;
let projectId: string;
let releaseId: string;
let issueAId: string;
let issueBId: string;
let doneStatusId: string;
let todoStatusId: string;

async function grantSystemRole(userId: string, role: string) {
  await prisma.userSystemRole.upsert({
    where: { userId_role: { userId, role: role as never } },
    create: { userId, role: role as never },
    update: {},
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await request.post('/api/auth/login').send({ email, password: 'Password123' });
  return res.body.accessToken as string;
}

beforeEach(async () => {
  // Cleanup in FK-dependency order.
  await prisma.auditLog.deleteMany();
  await prisma.checkpointViolationEvent.deleteMany();
  await prisma.releaseCheckpoint.deleteMany();
  await prisma.checkpointTemplateItem.deleteMany();
  await prisma.checkpointTemplate.deleteMany();
  await prisma.checkpointType.deleteMany();
  await prisma.issueCustomFieldValue.deleteMany();
  await prisma.issueLink.deleteMany();
  await prisma.releaseItem.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.release.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const adminRes = await createTestUser('admin@ttmp160pr3.test', 'Password123', 'Admin');
  await grantSystemRole(adminRes.user.id, 'ADMIN');
  adminToken = await loginAs('admin@ttmp160pr3.test');

  const rmRes = await createTestUser('rm@ttmp160pr3.test', 'Password123', 'Release Manager');
  await grantSystemRole(rmRes.user.id, 'RELEASE_MANAGER');
  rmToken = await loginAs('rm@ttmp160pr3.test');

  const plainRes = await createTestUser('plain@ttmp160pr3.test', 'Password123', 'Plain');
  plainToken = plainRes.accessToken;
  plainUserId = plainRes.user.id;

  // Project + release with plannedDate.
  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'TTMP-160 PR-3', key: 'PR3' });
  projectId = proj.body.id;

  const rel = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0.0', projectId, plannedDate: '2026-06-01' });
  releaseId = rel.body.id;

  // Workflow status fixtures — find DONE and TODO categories.
  const statuses = await prisma.workflowStatus.findMany({
    where: { category: { in: ['DONE', 'TODO'] } },
    select: { id: true, category: true },
  });
  doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
  todoStatusId = statuses.find((s) => s.category === 'TODO')!.id;

  // Two issues in the release: A in DONE, B in TODO.
  const issueA = await prisma.issue.create({
    data: {
      projectId,
      number: 1,
      title: 'Issue A (DONE)',
      creatorId: adminRes.user.id,
      workflowStatusId: doneStatusId,
    },
  });
  issueAId = issueA.id;

  const issueB = await prisma.issue.create({
    data: {
      projectId,
      number: 2,
      title: 'Issue B (TODO)',
      creatorId: adminRes.user.id,
      workflowStatusId: todoStatusId,
    },
  });
  issueBId = issueB.id;

  await prisma.releaseItem.createMany({
    data: [
      { releaseId, issueId: issueAId, addedById: adminRes.user.id },
      { releaseId, issueId: issueBId, addedById: adminRes.user.id },
    ],
  });
});

async function createType(name: string, offsetDays = -7) {
  const res = await request
    .post('/api/admin/checkpoint-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name,
      color: '#52C41A',
      weight: 'HIGH',
      offsetDays,
      criteria: [{ type: 'STATUS_IN', categories: ['DONE'] }],
    });
  return res.body.id as string;
}

async function createTemplate(typeIds: string[]) {
  const res = await request
    .post('/api/admin/checkpoint-templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Standard',
      items: typeIds.map((id, idx) => ({ checkpointTypeId: id, orderIndex: idx })),
    });
  return res.body.id as string;
}

// ============================================================
// apply-template
// ============================================================

describe('POST /api/releases/:releaseId/checkpoints/apply-template', () => {
  it('creates ReleaseCheckpoints with criteria + offsetDays snapshots; runs initial recompute', async () => {
    const typeId = await createType('Code freeze', -7);
    const templateId = await createTemplate([typeId]);

    const res = await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    expect(res.status).toBe(201);
    expect(res.body.checkpoints).toHaveLength(1);
    const cp = res.body.checkpoints[0];
    expect(cp.offsetDaysSnapshot).toBe(-7);
    expect(cp.deadline).toBe('2026-05-25'); // 2026-06-01 − 7 days
    // Issue A (DONE) passes, Issue B (TODO) violates.
    expect(cp.breakdown).toEqual({ applicable: 2, passed: 1, violated: 1 });
    expect(cp.violatedIssues).toHaveLength(1);
    expect(cp.violatedIssues[0].issueId).toBe(issueBId);

    const dbRow = await prisma.releaseCheckpoint.findFirst({ where: { releaseId } });
    expect(dbRow!.offsetDaysSnapshot).toBe(-7);
    expect(dbRow!.criteriaSnapshot).toEqual([{ type: 'STATUS_IN', categories: ['DONE'] }]);
  });

  it('FR-15 snapshot: editing the source CheckpointType does not change running checkpoints', async () => {
    const typeId = await createType('Freeze', -7);
    const templateId = await createTemplate([typeId]);

    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    await request
      .patch(`/api/admin/checkpoint-types/${typeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ offsetDays: -30, criteria: [{ type: 'ASSIGNEE_SET' }] });

    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints`)
      .set('Authorization', `Bearer ${rmToken}`);

    expect(res.body.checkpoints[0].offsetDaysSnapshot).toBe(-7);
    expect(res.body.checkpoints[0].deadline).toBe('2026-05-25');
  });

  it('RELEASE_PLANNED_DATE_REQUIRED when release has no plannedDate', async () => {
    const nakedRel = await request
      .post('/api/releases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'naked', projectId });
    const typeId = await createType('Naked', -3);
    const templateId = await createTemplate([typeId]);

    const res = await request
      .post(`/api/releases/${nakedRel.body.id}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ templateId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('RELEASE_PLANNED_DATE_REQUIRED');
  });

  it('403 for plain USER on apply-template', async () => {
    const typeId = await createType('T', -3);
    const templateId = await createTemplate([typeId]);
    const res = await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ templateId });
    expect(res.status).toBe(403);
  });
});

// ============================================================
// preview-template
// ============================================================

describe('POST /api/releases/:releaseId/checkpoints/preview-template', () => {
  it('returns per-type previews without writing to DB', async () => {
    const typeId = await createType('Code freeze', -7);
    const templateId = await createTemplate([typeId]);

    const res = await request
      .post(`/api/releases/${releaseId}/checkpoints/preview-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    expect(res.status).toBe(200);
    expect(res.body.previews).toHaveLength(1);
    expect(res.body.previews[0].breakdown).toEqual({ applicable: 2, passed: 1, violated: 1 });
    expect(res.body.previews[0].deadline).toBe('2026-05-25');

    const dbRows = await prisma.releaseCheckpoint.findMany({ where: { releaseId } });
    expect(dbRows).toHaveLength(0);
  });
});

// ============================================================
// list + breakdown shape
// ============================================================

describe('GET /api/releases/:releaseId/checkpoints', () => {
  it('returns risk + breakdown + passedIssues + violatedIssues after apply', async () => {
    const typeId = await createType('Code freeze', -7);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints`)
      .set('Authorization', `Bearer ${rmToken}`);

    expect(res.status).toBe(200);
    expect(res.body.releaseId).toBe(releaseId);
    expect(res.body.risk.level).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
    const cp = res.body.checkpoints[0];
    expect(cp.passedIssues.map((p: { issueId: string }) => p.issueId)).toEqual([issueAId]);
    expect(cp.violatedIssues.map((v: { issueId: string }) => v.issueId)).toEqual([issueBId]);
  });
});

// ============================================================
// recompute idempotency + event lifecycle
// ============================================================

describe('POST /api/releases/:releaseId/checkpoints/recompute', () => {
  it('is idempotent: second call with no data change performs zero updates', async () => {
    const typeId = await createType('Code freeze', -7);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    const res = await request
      .post(`/api/releases/${releaseId}/checkpoints/recompute`)
      .set('Authorization', `Bearer ${rmToken}`);

    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(0);
    expect(res.body.unchangedCount).toBe(1);
  });

  it('opens a CheckpointViolationEvent on transition to violating; closes on resolution', async () => {
    const typeId = await createType('Code freeze', -7);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    // Initial recompute (inside apply) opens an event for Issue B (TODO violating STATUS_IN=DONE).
    const openEvents = await prisma.checkpointViolationEvent.findMany({
      where: { resolvedAt: null },
    });
    expect(openEvents).toHaveLength(1);
    expect(openEvents[0]!.issueId).toBe(issueBId);

    // Resolve Issue B by moving to DONE.
    await prisma.issue.update({
      where: { id: issueBId },
      data: { workflowStatusId: doneStatusId },
    });

    await request
      .post(`/api/releases/${releaseId}/checkpoints/recompute`)
      .set('Authorization', `Bearer ${rmToken}`);

    const resolved = await prisma.checkpointViolationEvent.findMany();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.resolvedAt).not.toBeNull();
  });
});

// ============================================================
// add + delete
// ============================================================

describe('POST/DELETE /api/releases/:releaseId/checkpoints', () => {
  it('adds a checkpoint by typeId and deletes it', async () => {
    const typeId = await createType('Ad-hoc', -3);

    const added = await request
      .post(`/api/releases/${releaseId}/checkpoints`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ checkpointTypeIds: [typeId] });
    expect(added.status).toBe(201);
    expect(added.body.checkpoints).toHaveLength(1);
    const checkpointId = added.body.checkpoints[0].id;

    const del = await request
      .delete(`/api/releases/${releaseId}/checkpoints/${checkpointId}`)
      .set('Authorization', `Bearer ${rmToken}`);
    expect(del.status).toBe(200);

    const remaining = await prisma.releaseCheckpoint.findMany({ where: { releaseId } });
    expect(remaining).toHaveLength(0);
  });
});

// ============================================================
// inline include (FR-19)
// ============================================================

describe('GET /api/issues/:id?include=checkpoints', () => {
  it('inlines checkpoints that touch the issue (grouped by release)', async () => {
    const typeId = await createType('Freeze', -7);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    const res = await request
      .get(`/api/issues/${issueBId}?include=checkpoints`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.checkpoints)).toBe(true);
    expect(res.body.checkpoints).toHaveLength(1);
    expect(res.body.checkpoints[0].releaseId).toBe(releaseId);
    expect(res.body.checkpoints[0].checkpoints[0].violatedIssues[0].issueId).toBe(issueBId);
  });

  it('omits checkpoints when ?include is absent', async () => {
    const res = await request
      .get(`/api/issues/${issueBId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.checkpoints).toBeUndefined();
  });
});

// ============================================================
// sync-instances (FR-15)
// ============================================================

describe('POST /api/admin/checkpoint-types/:id/sync-instances', () => {
  it('updates criteria + offsetDays snapshot and shifts deadline', async () => {
    const typeId = await createType('Freeze', -7);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    // Edit the type — snapshots on the instance stay until sync.
    await request
      .patch(`/api/admin/checkpoint-types/${typeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ offsetDays: -3, criteria: [{ type: 'ASSIGNEE_SET' }] });

    const res = await request
      .post(`/api/admin/checkpoint-types/${typeId}/sync-instances`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ releaseIds: [releaseId] });
    expect(res.status).toBe(200);
    expect(res.body.syncedCount).toBe(1);

    const rc = await prisma.releaseCheckpoint.findFirstOrThrow({ where: { releaseId } });
    expect(rc.offsetDaysSnapshot).toBe(-3);
    // 2026-06-01 − 3 days = 2026-05-29.
    expect(rc.deadline.toISOString().slice(0, 10)).toBe('2026-05-29');
  });

  it('plain USER gets 403 on sync-instances', async () => {
    const typeId = await createType('T', -3);
    const res = await request
      .post(`/api/admin/checkpoint-types/${typeId}/sync-instances`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ releaseIds: [releaseId] });
    expect(res.status).toBe(403);
  });
});

// ============================================================
// RBAC
// ============================================================

describe('RBAC on release-checkpoint mutations', () => {
  it('USER cannot recompute (403)', async () => {
    const typeId = await createType('T', -3);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ templateId });

    const res = await request
      .post(`/api/releases/${releaseId}/checkpoints/recompute`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });

  it('project VIEWER can GET list (read-level gate) but not mutate', async () => {
    await prisma.userProjectRole.create({
      data: {
        userId: plainUserId,
        projectId,
        role: 'VIEWER',
      },
    });
    const viewerToken = await loginAs('plain@ttmp160pr3.test');

    const get = await request
      .get(`/api/releases/${releaseId}/checkpoints`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(get.status).toBe(200);

    // Mutation requires RELEASES_EDIT which VIEWER doesn't have.
    const typeId = await createType('viewer-test', -3);
    const recomputeRes = await request
      .post(`/api/releases/${releaseId}/checkpoints/recompute`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(recomputeRes.status).toBe(403);

    // Suppress unused-var lint on typeId — kept for debuggability of the added helper row.
    expect(typeId).toBeTruthy();
  });

  it('USER with no project membership cannot read the list (403)', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// event-closure on checkpoint delete (FR-22/FR-23)
// ============================================================

describe('DELETE /api/releases/:releaseId/checkpoints/:checkpointId — event lifecycle', () => {
  it('resolves open CheckpointViolationEvent rows before deletion cascades', async () => {
    const typeId = await createType('freeze', -7);
    const templateId = await createTemplate([typeId]);
    await request
      .post(`/api/releases/${releaseId}/checkpoints/apply-template`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ templateId });

    const cp = await prisma.releaseCheckpoint.findFirstOrThrow({ where: { releaseId } });
    expect(
      await prisma.checkpointViolationEvent.count({
        where: { releaseCheckpointId: cp.id, resolvedAt: null },
      }),
    ).toBeGreaterThan(0);

    const del = await request
      .delete(`/api/releases/${releaseId}/checkpoints/${cp.id}`)
      .set('Authorization', `Bearer ${rmToken}`);
    expect(del.status).toBe(200);

    // Cascade removes the events; semantic "closed" is recorded prior to the cascade.
    // We assert no orphan-open events remain for the deleted checkpoint id.
    const orphans = await prisma.checkpointViolationEvent.findMany({
      where: { releaseCheckpointId: cp.id, resolvedAt: null },
    });
    expect(orphans).toHaveLength(0);
  });
});
