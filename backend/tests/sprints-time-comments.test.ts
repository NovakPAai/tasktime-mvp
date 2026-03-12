import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let projectId: string;
let issueId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const reg = await request.post('/api/auth/register').send({
    email: 'admin2@test.com',
    password: 'password123',
    name: 'Admin 2',
  });
  await prisma.user.update({ where: { id: reg.body.user.id }, data: { role: 'ADMIN' } });
  const login = await request.post('/api/auth/login').send({ email: 'admin2@test.com', password: 'password123' });
  adminToken = login.body.accessToken;

  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sprint Project', key: 'SPR' });
  projectId = proj.body.id;

  const issue = await request.post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Issue for sprint', type: 'TASK' });
  issueId = issue.body.id;
});

describe('Sprint 2 APIs: sprints, time, comments, history', () => {
  it('creates sprint, moves issue, starts and closes sprint', async () => {
    const sprintRes = await request.post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sprint 1' });
    expect(sprintRes.status).toBe(201);

    const sprintId = sprintRes.body.id as string;

    const moveRes = await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });
    expect(moveRes.status).toBe(200);

    const startRes = await request.post(`/api/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.state).toBe('ACTIVE');

    const closeRes = await request.post(`/api/sprints/${sprintId}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.state).toBe('CLOSED');
  });

  it('logs time via timer and manual entry', async () => {
    const start = await request.post(`/api/issues/${issueId}/time/start`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(start.status).toBe(201);

    const stop = await request.post(`/api/issues/${issueId}/time/stop`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(stop.status).toBe(200);

    const manual = await request.post(`/api/issues/${issueId}/time`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 1.5, note: 'Manual log from test' });
    expect(manual.status).toBe(201);

    const logs = await request.get(`/api/issues/${issueId}/time`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logs.status).toBe(200);
    expect(logs.body.length).toBeGreaterThan(0);
  });

  it('creates comments and returns them on issue detail page API', async () => {
    const commentRes = await request.post(`/api/issues/${issueId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'First comment' });
    expect(commentRes.status).toBe(201);

    const listRes = await request.get(`/api/issues/${issueId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].body).toBe('First comment');
  });

  it('returns issue history from audit_log', async () => {
    const update = await request.patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(update.status).toBe(200);

    const historyRes = await request.get(`/api/issues/${issueId}/history`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
  });
});

