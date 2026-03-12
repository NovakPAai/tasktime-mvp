import { describe, it, expect, beforeEach } from 'vitest';
import { request } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let adminToken: string;
let projectId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const reg = await request.post('/api/auth/register').send({
    email: 'admin@test.com', password: 'password123', name: 'Admin',
  });
  await prisma.user.update({ where: { id: reg.body.user.id }, data: { role: 'ADMIN' } });
  const login = await request.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });
  adminToken = login.body.accessToken;

  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test', key: 'TST' });
  projectId = proj.body.id;
});

describe('Issues API', () => {
  it('POST /api/projects/:projectId/issues - creates issue', async () => {
    const res = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'First issue', type: 'TASK' });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(1);
    expect(res.body.type).toBe('TASK');
  });

  it('creates EPIC and STORY hierarchy', async () => {
    const epic = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Epic', type: 'EPIC' });
    expect(epic.status).toBe(201);

    const story = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Story', type: 'STORY', parentId: epic.body.id });
    expect(story.status).toBe(201);
  });

  it('rejects invalid hierarchy (EPIC under STORY)', async () => {
    const story = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Story', type: 'STORY' });

    const res = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bad Epic', type: 'EPIC', parentId: story.body.id });
    expect(res.status).toBe(400);
  });

  it('rejects SUBTASK under SUBTASK', async () => {
    const task = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Task', type: 'TASK' });

    const sub = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Sub', type: 'SUBTASK', parentId: task.body.id });

    const res = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'SubSub', type: 'SUBTASK', parentId: sub.body.id });
    expect(res.status).toBe(400);
  });

  it('GET /api/projects/:projectId/issues - lists issues', async () => {
    await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue 1' });
    await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue 2' });

    const res = await request.get(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('GET /api/projects/:projectId/issues - supports filters and search', async () => {
    await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Open task', status: 'OPEN' });
    const doneIssue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Done bug', type: 'BUG' });

    // Move second issue to DONE status via dedicated status endpoint
    await request
      .patch(`/api/issues/${doneIssue.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DONE' });

    const resStatus = await request
      .get(`/api/projects/${projectId}/issues`)
      .query({ status: 'DONE' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resStatus.status).toBe(200);
    expect(resStatus.body.length).toBe(1);

    const resSearch = await request
      .get(`/api/projects/${projectId}/issues`)
      .query({ search: 'bug' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resSearch.status).toBe(200);
    expect(resSearch.body.length).toBe(1);
  });

  it('PATCH /api/issues/:id/status - changes status', async () => {
    const create = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Status Test' });

    const res = await request.patch(`/api/issues/${create.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('GET /api/issues/:id - returns issue detail', async () => {
    const create = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Detail Test', type: 'EPIC' });

    const res = await request.get(`/api/issues/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Detail Test');
    expect(res.body.project.key).toBe('TST');
  });

  it('DELETE /api/issues/:id - deletes issue', async () => {
    const create = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Delete Me' });

    const res = await request.delete(`/api/issues/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it('auto-increments issue numbers per project', async () => {
    const i1 = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'First' });
    const i2 = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Second' });
    expect(i1.body.number).toBe(1);
    expect(i2.body.number).toBe(2);
  });

  it('POST /api/projects/:projectId/issues/bulk - updates status for multiple issues', async () => {
    const i1 = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bulk 1' });
    const i2 = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bulk 2' });

    const res = await request.post(`/api/projects/${projectId}/issues/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [i1.body.id, i2.body.id], status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(2);

    const list = await request
      .get(`/api/projects/${projectId}/issues`)
      .query({ status: 'IN_PROGRESS' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
  });
});
