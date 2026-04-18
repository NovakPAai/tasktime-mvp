/**
 * TTMP-160 PR-9 — integration tests for the matrix view.
 *
 * Covers:
 *   - GET /api/releases/:releaseId/checkpoints/matrix — shape + per-cell state derivation.
 *   - Same endpoint with ?format=csv — UTF-8 BOM + CRLF + expected header/row.
 *   - Read-gate: plain USER without project membership → 403.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let plainToken: string;
let adminUserId: string;
let plainUserId: string;
let projectId: string;
let releaseId: string;
let issueAId: string; // DONE — passes STATUS_IN=DONE
let issueBId: string; // TODO — violates STATUS_IN=DONE
let issueCId: string; // TASK type — excluded by issueTypes=[BUG] filter
let bugTypeId: string;
let taskTypeId: string;
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

  const adminRes = await createTestUser('admin@pr9.test', 'Password123', 'Admin');
  await grantSystemRole(adminRes.user.id, 'ADMIN');
  adminToken = await loginAs('admin@pr9.test');
  adminUserId = adminRes.user.id;

  const plainRes = await createTestUser('plain@pr9.test', 'Password123', 'Plain');
  plainToken = plainRes.accessToken;
  plainUserId = plainRes.user.id;

  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'PR-9', key: 'PR9' });
  projectId = proj.body.id;

  const rel = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0', projectId, plannedDate: '2026-06-01' });
  releaseId = rel.body.id;

  // Lookups.
  const statuses = await prisma.workflowStatus.findMany({
    where: { category: { in: ['DONE', 'TODO'] } },
    select: { id: true, category: true },
  });
  doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
  todoStatusId = statuses.find((s) => s.category === 'TODO')!.id;

  const types = await prisma.issueTypeConfig.findMany({
    where: { systemKey: { in: ['TASK', 'BUG'] } },
    select: { id: true, systemKey: true },
  });
  taskTypeId = types.find((t) => t.systemKey === 'TASK')!.id;
  bugTypeId = types.find((t) => t.systemKey === 'BUG')!.id;

  // Issue A: BUG type, DONE status → passes STATUS_IN=[DONE] + issueTypes=[BUG]
  issueAId = (
    await prisma.issue.create({
      data: {
        projectId,
        number: 1,
        title: 'Bug DONE',
        creatorId: adminUserId,
        workflowStatusId: doneStatusId,
        issueTypeConfigId: bugTypeId,
      },
    })
  ).id;

  // Issue B: BUG type, TODO status → violates
  issueBId = (
    await prisma.issue.create({
      data: {
        projectId,
        number: 2,
        title: 'Bug TODO',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
        issueTypeConfigId: bugTypeId,
      },
    })
  ).id;

  // Issue C: TASK type → NOT applicable (issueTypes filter excludes TASK)
  issueCId = (
    await prisma.issue.create({
      data: {
        projectId,
        number: 3,
        title: 'Task foo',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
        issueTypeConfigId: taskTypeId,
      },
    })
  ).id;

  await prisma.releaseItem.createMany({
    data: [
      { releaseId, issueId: issueAId, addedById: adminUserId },
      { releaseId, issueId: issueBId, addedById: adminUserId },
      { releaseId, issueId: issueCId, addedById: adminUserId },
    ],
  });

  // Checkpoint type with issueTypes=[BUG] filter + STATUS_IN=[DONE].
  const typeRes = await request
    .post('/api/admin/checkpoint-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'BUG close',
      color: '#E5534B',
      weight: 'HIGH',
      offsetDays: -3,
      criteria: [{ type: 'STATUS_IN', categories: ['DONE'], issueTypes: ['BUG'] }],
    });

  await request
    .post(`/api/releases/${releaseId}/checkpoints`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ checkpointTypeIds: [typeRes.body.id] });

  await request
    .post(`/api/releases/${releaseId}/checkpoints/recompute`)
    .set('Authorization', `Bearer ${adminToken}`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ============================================================
// FR-26 / FR-27: matrix JSON + CSV
// ============================================================

describe('GET /api/releases/:releaseId/checkpoints/matrix', () => {
  it('returns issues × checkpoints matrix with correct per-cell state', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints/matrix`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.releaseId).toBe(releaseId);

    const keys = (res.body.issues as Array<{ key: string }>).map((i) => i.key);
    expect(keys).toEqual(['PR9-1', 'PR9-2', 'PR9-3']);

    expect(res.body.checkpoints).toHaveLength(1);
    expect(res.body.checkpoints[0].name).toBe('BUG close');

    // cells[i][0] per issue-ordering by key: A=DONE BUG → passed, B=TODO BUG → violated,
    //   C=TODO TASK → na (issueTypes filter excludes TASK).
    const cells = res.body.cells as Array<Array<{ state: string; reason?: string }>>;
    expect(cells[0]![0]!.state).toBe('passed');
    expect(cells[1]![0]!.state).toBe('violated');
    expect(cells[1]![0]!.reason).toMatch(/Статус/);
    expect(cells[2]![0]!.state).toBe('na');
  });

  it('plain USER without project membership → 403', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints/matrix`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });

  it('USER with membership in the project CAN read the matrix', async () => {
    await prisma.userProjectRole.create({
      data: { userId: plainUserId, projectId, role: 'USER' },
    });
    const token = await loginAs('plain@pr9.test');
    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints/matrix`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/releases/:releaseId/checkpoints/matrix?format=csv', () => {
  it('returns text/csv with UTF-8 BOM and CRLF', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/checkpoints/matrix?format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const text = res.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    const bodyAfterBom = text.slice(1);
    const lines = bodyAfterBom.split('\r\n');
    // Header: issue_key,issue_title,BUG close
    expect(lines[0]).toBe('issue_key,issue_title,BUG close');
    // PR9-1 = passed, PR9-2 = violated, PR9-3 = —
    expect(lines[1]).toContain('PR9-1');
    expect(lines[1]).toContain('OK');
    expect(lines[2]).toContain('PR9-2');
    expect(lines[2]).toMatch(/VIOLATED/);
    expect(lines[3]).toContain('PR9-3');
    expect(lines[3]).toMatch(/—$/);
  });
});
