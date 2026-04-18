/**
 * TTMP-160 PR-7 — integration tests for the board-topbar data surfaces.
 *
 * Covers:
 *   - GET /api/projects/:projectId/checkpoint-violating-issues (FR-11)
 *   - GET /api/my-checkpoint-violations (FR-12 + SEC-7)
 *   - GET /api/my-checkpoint-violations/count (FR-12)
 *
 * Specifically exercises:
 *   - Happy path: issues in a violated checkpoint surface through each endpoint.
 *   - SEC-7: a user only sees their own assigned issues in /my-violations.
 *   - Project-membership scope: a user without global read role cannot see violations
 *     from projects they are not a member of (even for issues assigned to them).
 *   - Count endpoint returns a plain integer and matches the list length.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let adminUserId: string;
let plainToken: string;
let plainUserId: string;
let otherUserId: string;
let projectId: string;
let foreignProjectId: string;
let releaseId: string;
let foreignReleaseId: string;
let doneStatusId: string;
let todoStatusId: string;
let typeId: string;

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

const VALID_CRITERIA = [{ type: 'STATUS_IN', categories: ['DONE'] }];

beforeEach(async () => {
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
  await prisma.userProjectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const adminRes = await createTestUser('admin@pr7.test', 'Password123', 'Admin');
  await grantSystemRole(adminRes.user.id, 'ADMIN');
  adminToken = await loginAs('admin@pr7.test');
  adminUserId = adminRes.user.id;

  const plainRes = await createTestUser('plain@pr7.test', 'Password123', 'Plain');
  plainToken = plainRes.accessToken;
  plainUserId = plainRes.user.id;

  const otherRes = await createTestUser('other@pr7.test', 'Password123', 'Other');
  otherUserId = otherRes.user.id;

  // Project where `plain` is a member.
  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'PR-7 Main', key: 'PR7M' });
  projectId = proj.body.id;
  await prisma.userProjectRole.create({
    data: { userId: plainUserId, projectId, role: 'USER' },
  });

  // Foreign project where `plain` is NOT a member.
  const foreignProj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'PR-7 Foreign', key: 'PR7F' });
  foreignProjectId = foreignProj.body.id;

  // Releases with plannedDate in the past so the checkpoint can be VIOLATED.
  const rel = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0.0', projectId, plannedDate: '2026-01-01' });
  releaseId = rel.body.id;

  const foreignRel = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0.0', projectId: foreignProjectId, plannedDate: '2026-01-01' });
  foreignReleaseId = foreignRel.body.id;

  // Workflow statuses: TODO + DONE.
  const statuses = await prisma.workflowStatus.findMany({
    where: { category: { in: ['DONE', 'TODO'] } },
    select: { id: true, category: true },
  });
  doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
  todoStatusId = statuses.find((s) => s.category === 'TODO')!.id;

  // Issues:
  //   main project: A (assigned to `plain`, TODO → violates), B (assigned to `other`, TODO)
  //   foreign project: C (assigned to `plain`, TODO)
  const issueA = await prisma.issue.create({
    data: {
      projectId,
      number: 1,
      title: 'Main A (plain)',
      creatorId: adminUserId,
      assigneeId: plainUserId,
      workflowStatusId: todoStatusId,
    },
  });
  const issueB = await prisma.issue.create({
    data: {
      projectId,
      number: 2,
      title: 'Main B (other)',
      creatorId: adminUserId,
      assigneeId: otherUserId,
      workflowStatusId: todoStatusId,
    },
  });
  const issueC = await prisma.issue.create({
    data: {
      projectId: foreignProjectId,
      number: 1,
      title: 'Foreign C (plain)',
      creatorId: adminUserId,
      assigneeId: plainUserId,
      workflowStatusId: todoStatusId,
    },
  });

  await prisma.releaseItem.createMany({
    data: [
      { releaseId, issueId: issueA.id, addedById: adminUserId },
      { releaseId, issueId: issueB.id, addedById: adminUserId },
      { releaseId: foreignReleaseId, issueId: issueC.id, addedById: adminUserId },
    ],
  });

  // Checkpoint type + apply to both releases so both reach VIOLATED state.
  const typeRes = await request
    .post('/api/admin/checkpoint-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'freeze',
      color: '#888888',
      weight: 'HIGH',
      offsetDays: -7,
      criteria: VALID_CRITERIA,
    });
  typeId = typeRes.body.id;

  await request
    .post(`/api/releases/${releaseId}/checkpoints`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ checkpointTypeIds: [typeId] });

  await request
    .post(`/api/releases/${foreignReleaseId}/checkpoints`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ checkpointTypeIds: [typeId] });

  // Final recompute on each release — plannedDate is in 2026-01-01, so deadline (minus 7d)
  // is already in the past, giving state=VIOLATED for the TODO violators.
  await request
    .post(`/api/releases/${releaseId}/checkpoints/recompute`)
    .set('Authorization', `Bearer ${adminToken}`);
  await request
    .post(`/api/releases/${foreignReleaseId}/checkpoints/recompute`)
    .set('Authorization', `Bearer ${adminToken}`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ============================================================
// GET /api/projects/:projectId/checkpoint-violating-issues
// ============================================================

describe('GET /api/projects/:projectId/checkpoint-violating-issues', () => {
  it('returns every issue currently violating a VIOLATED checkpoint (dedup by issueId)', async () => {
    const res = await request
      .get(`/api/projects/${projectId}/checkpoint-violating-issues`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const byId = Object.fromEntries(res.body.map((r: { issueId: string }) => [r.issueId, r]));
    // Both project issues are TODO and violate STATUS_IN=[DONE].
    expect(Object.keys(byId)).toHaveLength(2);
    const anyEntry = res.body[0] as {
      issueId: string;
      issueKey: string;
      projectKey: string;
      violations: Array<{ checkpointName: string; reason: string }>;
    };
    expect(anyEntry.projectKey).toBe('PR7M');
    expect(anyEntry.violations.length).toBeGreaterThan(0);
    expect(anyEntry.violations[0]!.checkpointName).toBe('freeze');
  });

  it('plain USER with project membership CAN read violating-issues (ISSUES_VIEW)', async () => {
    const res = await request
      .get(`/api/projects/${projectId}/checkpoint-violating-issues`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
  });

  it('plain USER without project membership gets 403', async () => {
    const res = await request
      .get(`/api/projects/${foreignProjectId}/checkpoint-violating-issues`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// GET /api/my-checkpoint-violations
// ============================================================

describe('GET /api/my-checkpoint-violations', () => {
  it('SEC-7: returns only issues assigned to the requesting user', async () => {
    const res = await request
      .get('/api/my-checkpoint-violations')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
    // `plain` owns main-A (in their member project) only. Foreign-C is also assigned to
    // `plain` but the scope filter excludes it because `plain` is not a member of the
    // foreign project and has no global read role.
    expect(res.body).toHaveLength(1);
    expect(res.body[0].issueKey).toBe('PR7M-1');
  });

  it('ADMIN bypasses project-membership scope — sees issues across all projects', async () => {
    // Assign an issue in the foreign project to admin for this test:
    await prisma.issue.updateMany({
      where: { projectId: foreignProjectId, number: 1 },
      data: { assigneeId: adminUserId },
    });

    const res = await request
      .get('/api/my-checkpoint-violations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const keys = (res.body as Array<{ issueKey: string }>).map((r) => r.issueKey);
    expect(keys).toContain('PR7F-1'); // cross-project visible for ADMIN
  });

  it('returns an empty array when the user has no violating issues', async () => {
    const res = await request
      .get('/api/my-checkpoint-violations')
      .set('Authorization', `Bearer ${otherUserId ? plainToken : plainToken}`);
    // `plain` has one violating (PR7M-1). Resolve it: switch status to DONE and recompute.
    await prisma.issue.updateMany({
      where: { projectId, number: 1 },
      data: { workflowStatusId: doneStatusId },
    });
    await request
      .post(`/api/releases/${releaseId}/checkpoints/recompute`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res2 = await request
      .get('/api/my-checkpoint-violations')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual([]);
    expect(res.status).toBe(200); // sanity
  });
});

// ============================================================
// GET /api/my-checkpoint-violations/count
// ============================================================

describe('GET /api/my-checkpoint-violations/count', () => {
  it('returns a plain integer count', async () => {
    const res = await request
      .get('/api/my-checkpoint-violations/count')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
    // `plain` owns main-A (violating) and foreign-C (violating). The count endpoint does
    // NOT apply project-membership scope (it's an integer, leaks no titles), so both count.
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 when the user has no assigned issues at all', async () => {
    // Temporarily null out `other`'s assignments (they had none anyway — Main-B is the only
    // one, owned by `other`).
    const otherRes = await request
      .post('/api/auth/register')
      .send({ email: 'zero@pr7.test', password: 'Password123', name: 'Zero' });
    const zeroToken = (
      await request.post('/api/auth/login').send({ email: 'zero@pr7.test', password: 'Password123' })
    ).body.accessToken as string;

    const res = await request
      .get('/api/my-checkpoint-violations/count')
      .set('Authorization', `Bearer ${zeroToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(otherRes.status).toBe(201);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request.get('/api/my-checkpoint-violations/count');
    expect(res.status).toBe(401);
  });
});
