import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, getIssueTypeConfigId } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let adminUserId: string;
let managerToken: string;
let managerUserId: string;
let userToken: string;
let userUserId: string;
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
  adminUserId = reg.body.user.id as string;
  await prisma.user.update({ where: { id: reg.body.user.id }, data: { role: 'ADMIN' } });
  const login = await request.post('/api/auth/login').send({ email: 'admin2@test.com', password: 'password123' });
  adminToken = login.body.accessToken;

  const managerReg = await request.post('/api/auth/register').send({
    email: 'manager2@test.com',
    password: 'password123',
    name: 'Manager 2',
  });
  managerUserId = managerReg.body.user.id as string;
  await prisma.user.update({ where: { id: managerUserId }, data: { role: 'MANAGER' } });
  const managerLogin = await request.post('/api/auth/login').send({ email: 'manager2@test.com', password: 'password123' });
  managerToken = managerLogin.body.accessToken;

  const userReg = await request.post('/api/auth/register').send({
    email: 'user2@test.com',
    password: 'password123',
    name: 'User 2',
  });
  userUserId = userReg.body.user.id as string;
  const userLogin = await request.post('/api/auth/login').send({ email: 'user2@test.com', password: 'password123' });
  userToken = userLogin.body.accessToken;

  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sprint Project', key: 'SPR' });
  projectId = proj.body.id;

  const taskConfigId = await getIssueTypeConfigId('TASK');
  const issue = await request.post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Issue for sprint', issueTypeConfigId: taskConfigId });
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

  it('returns sprint details with issues for drill-down view', async () => {
    const sprintRes = await request.post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sprint Detail' });
    expect(sprintRes.status).toBe(201);

    const sprintId = sprintRes.body.id as string;

    const moveRes = await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });
    expect(moveRes.status).toBe(200);

    const detailRes = await request.get(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.sprint.id).toBe(sprintId);
    expect(detailRes.body.sprint.name).toBe('Sprint Detail');
    expect(Array.isArray(detailRes.body.issues)).toBe(true);
    expect(detailRes.body.issues).toHaveLength(1);
    expect(detailRes.body.issues[0]).toMatchObject({
      id: issueId,
      projectId,
      title: 'Issue for sprint',
      status: 'OPEN',
      priority: 'MEDIUM',
      project: {
        id: projectId,
        key: 'SPR',
        name: 'Sprint Project',
      },
    });
    expect(detailRes.body.issues[0].number).toBeTypeOf('number');
    expect(detailRes.body.issues[0].updatedAt).toBeTypeOf('string');
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

  it('returns user time summary with separated human and agent aggregates', async () => {
    const manual = await request.post(`/api/issues/${issueId}/time`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 1.5, note: 'Human work' });
    expect(manual.status).toBe(201);

    const agentSession = await request.post('/api/ai-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        issueId,
        userId: adminUserId,
        model: 'claude-3-7-sonnet',
        provider: 'anthropic',
        startedAt: '2026-03-13T10:00:00.000Z',
        finishedAt: '2026-03-13T12:00:00.000Z',
        tokensInput: 1000,
        tokensOutput: 500,
        costMoney: 12.34,
        notes: 'Agent work',
        issueSplits: [{ issueId, ratio: 1 }],
      });
    expect(agentSession.status).toBe(201);

    const summary = await request.get(`/api/users/${adminUserId}/time/summary`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({
      userId: adminUserId,
      humanHours: 1.5,
      agentHours: 2,
      totalHours: 3.5,
      agentCost: 12.34,
    });
  });

  it('forbids a regular user from reading another users time summary', async () => {
    const manual = await request.post(`/api/issues/${issueId}/time`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 1.5, note: 'Human work' });
    expect(manual.status).toBe(201);

    const summary = await request.get(`/api/users/${adminUserId}/time/summary`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(summary.status).toBe(403);
    expect(summary.body.error).toBe('Insufficient permissions');
  });

  it('allows a manager to read another users time summary', async () => {
    const manual = await request.post(`/api/issues/${issueId}/time`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 1.5, note: 'Human work' });
    expect(manual.status).toBe(201);

    const summary = await request.get(`/api/users/${adminUserId}/time/summary`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({
      userId: adminUserId,
      humanHours: 1.5,
      agentHours: 0,
      totalHours: 1.5,
      agentCost: 0,
    });
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

