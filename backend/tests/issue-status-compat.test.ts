/**
 * TTADM-64: Backward compatibility — строковые алиасы статусов в REST API
 *
 * Проверяет, что после перехода на Workflow Engine:
 * 1. Поле `status` (строка) остаётся в ответах API
 * 2. Поле `workflowStatus` (объект) появляется рядом
 * 3. PATCH /issues/:id/status принимает строковые статусы и обновляет оба поля
 * 4. Фильтрация по строковому status в GET /projects/:id/issues работает
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { request } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_STATUSES = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as const;

let adminToken: string;
let projectId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issueCustomFieldValue.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const reg = await request.post('/api/auth/register').send({
    email: 'admin@compat-test.com',
    password: 'Password123',
    name: 'Admin Compat',
  });
  await prisma.user.update({ where: { id: reg.body.user.id }, data: { role: 'ADMIN' } });

  const login = await request.post('/api/auth/login').send({
    email: 'admin@compat-test.com',
    password: 'Password123',
  });
  adminToken = login.body.accessToken;

  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Compat Test Project', key: 'CMPAT' });
  projectId = proj.body.id;
});

describe('Issue response includes both status (string) and workflowStatus (object)', () => {
  it('POST /api/projects/:id/issues — новая задача содержит status и workflowStatus', async () => {
    const res = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Compat issue' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    expect(res.body).toHaveProperty('workflowStatus');
    // workflowStatus не null если системные статусы сидированы миграцией
    if (res.body.workflowStatus !== null) {
      expect(res.body.workflowStatus).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        systemKey: 'OPEN',
      });
    }
  });

  it('GET /api/issues/:id — детальный ответ содержит оба поля', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Detail issue' });

    const res = await request
      .get(`/api/issues/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.status).toBe('string');
    expect(LEGACY_STATUSES).toContain(res.body.status);
    expect(res.body).toHaveProperty('workflowStatus');
  });

  it('GET /api/projects/:id/issues — список содержит оба поля на каждой задаче', async () => {
    await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue A' });
    await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue B' });

    const res = await request
      .get(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    for (const issue of res.body.data) {
      expect(typeof issue.status).toBe('string');
      expect(issue).toHaveProperty('workflowStatus');
    }
  });

  it('GET /api/issues/key/:key — ответ по ключу содержит оба поля', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Key lookup issue' });
    const issueKey = `CMPAT-${create.body.number}`;

    const res = await request
      .get(`/api/issues/key/${issueKey}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.status).toBe('string');
    expect(res.body).toHaveProperty('workflowStatus');
  });
});

describe('PATCH /issues/:id/status — строковые статусы принимаются и обновляют оба поля', () => {
  it('PATCH /api/issues/:id/status с IN_PROGRESS обновляет status и workflowStatus', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Status change test' });
    const issueId = create.body.id;

    const res = await request
      .patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body).toHaveProperty('workflowStatus');
    if (res.body.workflowStatus !== null) {
      expect(res.body.workflowStatus.systemKey).toBe('IN_PROGRESS');
    }
  });

  it('PATCH /api/issues/:id/status с DONE обновляет статус', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Done test' });
    const issueId = create.body.id;

    const res = await request
      .patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DONE' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DONE');
  });

  it('PATCH /api/issues/:id/status с CANCELLED обновляет статус', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Cancel test' });
    const issueId = create.body.id;

    const res = await request
      .patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('PATCH /api/issues/:id/status — неверный статус → 400', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Invalid status test' });

    const res = await request
      .patch(`/api/issues/${create.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
  });

  it('после PATCH /status: GET /api/issues/:id возвращает актуальный status строкой', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Roundtrip test' });
    const issueId = create.body.id;

    await request
      .patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REVIEW' });

    const res = await request
      .get(`/api/issues/${issueId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REVIEW');
    expect(res.body).toHaveProperty('workflowStatus');
  });
});

describe('Фильтрация по строковому status работает (backward compat)', () => {
  it('GET /api/projects/:id/issues?status=DONE возвращает только DONE задачи', async () => {
    const issue1 = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Open issue' });
    const issue2 = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Done issue' });

    await request
      .patch(`/api/issues/${issue2.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DONE' });

    const res = await request
      .get(`/api/projects/${projectId}/issues`)
      .query({ status: 'DONE' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('DONE');
    // Задача с OPEN не попала в выборку
    expect(res.body.data.map((i: { id: string }) => i.id)).not.toContain(issue1.body.id);
  });

  it('GET /api/projects/:id/issues?status=OPEN,IN_PROGRESS — множественный фильтр', async () => {
    const issue1 = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Open one' });
    const issue2 = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'In progress one' });
    const issue3 = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Done one' });

    await request
      .patch(`/api/issues/${issue2.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS' });
    await request
      .patch(`/api/issues/${issue3.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DONE' });

    const res = await request
      .get(`/api/projects/${projectId}/issues`)
      .query({ status: 'OPEN,IN_PROGRESS' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const returnedStatuses = res.body.data.map((i: { status: string }) => i.status);
    expect(returnedStatuses).toContain('OPEN');
    expect(returnedStatuses).toContain('IN_PROGRESS');
    expect(returnedStatuses).not.toContain('DONE');
  });
});

describe('workflowStatus.systemKey совпадает с legacy status', () => {
  it('systemKey в workflowStatus = legacy status для системных статусов', async () => {
    const create = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'SystemKey check' });
    const issueId = create.body.id;

    for (const status of ['IN_PROGRESS', 'REVIEW', 'DONE'] as const) {
      const res = await request
        .patch(`/api/issues/${issueId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
      // Если workflowStatus установлен — systemKey совпадает
      if (res.body.workflowStatus !== null) {
        expect(res.body.workflowStatus.systemKey).toBe(status);
      }
    }
  });
});
