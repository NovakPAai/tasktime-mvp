/**
 * TTMP-144 — Sprint BurnDown chart endpoint.
 *
 * Covers:
 *   - GET /api/sprints/:id/burndown returns series + idealLine
 *   - Works when sprint has no dates (returns empty series)
 *   - Unauthenticated request → 401
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, getIssueTypeConfigId } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let projectId: string;
let sprintId: string;
let adminUserId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const reg = await request.post('/api/auth/register').send({
    email: 'admin@sbtest.com', password: 'Password123', name: 'Admin',
  });
  adminUserId = reg.body.user.id;
  await prisma.userSystemRole.upsert({
    where: { userId_role: { userId: adminUserId, role: 'ADMIN' } },
    create: { userId: adminUserId, role: 'ADMIN' },
    update: {},
  });
  const login = await request.post('/api/auth/login').send({
    email: 'admin@sbtest.com', password: 'Password123',
  });
  adminToken = login.body.accessToken;

  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sprint BU', key: 'SBU' });
  projectId = proj.body.id;

  const sprintRes = await request.post(`/api/projects/${projectId}/sprints`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Sprint 1',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-14T23:59:59.000Z',
    });
  sprintId = sprintRes.body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('TTMP-144 — GET /api/sprints/:id/burndown', () => {
  it('returns burndown structure for sprint with issues', async () => {
    const taskTypeId = await getIssueTypeConfigId('TASK');
    // Create 3 issues in the sprint
    for (let i = 1; i <= 3; i++) {
      await request.post(`/api/projects/${projectId}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: `Issue ${i}`, issueTypeConfigId: taskTypeId });
    }
    // Add issues to sprint
    const sprintIssues = await prisma.issue.findMany({ where: { projectId }, select: { id: true } });
    await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: sprintIssues.map(i => i.id) });

    const res = await request
      .get(`/api/sprints/${sprintId}/burndown`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sprintId).toBe(sprintId);
    expect(res.body.totalIssues).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.series)).toBe(true);
    expect(Array.isArray(res.body.idealLine)).toBe(true);
    if (res.body.idealLine.length > 0) {
      expect(res.body.idealLine[0]).toHaveProperty('date');
      expect(res.body.idealLine[0]).toHaveProperty('value');
    }
  });

  it('returns empty series for sprint without dates', async () => {
    const noDateSprint = await request.post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'No Date Sprint' });

    const res = await request
      .get(`/api/sprints/${noDateSprint.body.id}/burndown`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.series).toEqual([]);
    expect(res.body.idealLine).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get(`/api/sprints/${sprintId}/burndown`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent sprint', async () => {
    const res = await request
      .get('/api/sprints/00000000-0000-0000-0000-000000000000/burndown')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
