/**
 * TTMP-226 / TTMP-228 — issue pagination stability + key-based URL resolution.
 *
 * Covers:
 *   - GET /issues/:id works with UUID (existing)
 *   - GET /issues/key/:key resolves TTMP-N → issue (TTMP-228)
 *   - GET /projects/:id/issues returns stable pagination (TTMP-226)
 *   - Pagination meta.total always reflects the full count
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, getIssueTypeConfigId } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let projectId: string;
let projectKey: string;
let issueId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const reg = await request.post('/api/auth/register').send({
    email: 'admin@keytest.com', password: 'Password123', name: 'Admin',
  });
  await prisma.userSystemRole.upsert({
    where: { userId_role: { userId: reg.body.user.id, role: 'ADMIN' } },
    create: { userId: reg.body.user.id, role: 'ADMIN' },
    update: {},
  });
  const login = await request.post('/api/auth/login').send({
    email: 'admin@keytest.com', password: 'Password123',
  });
  adminToken = login.body.accessToken;

  projectKey = 'KTU';
  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Key Test', key: projectKey });
  projectId = proj.body.id;

  const taskTypeId = await getIssueTypeConfigId('TASK');
  const created = await request.post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'First issue', issueTypeConfigId: taskTypeId });
  issueId = created.body.id;
});

describe('TTMP-228 — GET /api/issues/key/:key', () => {
  it('resolves PROJECT-N to the correct issue', async () => {
    const res = await request
      .get(`/api/issues/key/${projectKey}-1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(issueId);
    expect(res.body.number).toBe(1);
  });

  it('returns 400 for invalid key format', async () => {
    const res = await request
      .get('/api/issues/key/not-a-key')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent key', async () => {
    const res = await request
      .get(`/api/issues/key/${projectKey}-9999`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('TTMP-226 — Pagination stability', () => {
  it('returns correct meta.total and stable pages', async () => {
    const taskTypeId = await getIssueTypeConfigId('TASK');
    // Create 5 more issues (total = 6 including the beforeEach one)
    for (let i = 2; i <= 6; i++) {
      await request.post(`/api/projects/${projectId}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: `Issue ${i}`, issueTypeConfigId: taskTypeId });
    }

    // Page 1 with limit 2
    const page1 = await request
      .get(`/api/projects/${projectId}/issues?page=1&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.meta.total).toBe(6);
    expect(page1.body.meta.totalPages).toBe(3);
    expect(page1.body.data).toHaveLength(2);

    // Page 2 — no duplicates with page 1
    const page2 = await request
      .get(`/api/projects/${projectId}/issues?page=2&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(2);

    const page1Ids = page1.body.data.map((i: { id: string }) => i.id) as string[];
    const page2Ids = page2.body.data.map((i: { id: string }) => i.id) as string[];
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);

    // Page 3
    const page3 = await request
      .get(`/api/projects/${projectId}/issues?page=3&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page3.status).toBe(200);
    expect(page3.body.data).toHaveLength(2);

    // All 6 issues covered across 3 pages
    const allIds = [...page1Ids, ...page2Ids, ...page3.body.data.map((i: { id: string }) => i.id)];
    expect(new Set(allIds).size).toBe(6);
  });

  it('total is consistent between pages', async () => {
    const taskTypeId = await getIssueTypeConfigId('TASK');
    for (let i = 2; i <= 4; i++) {
      await request.post(`/api/projects/${projectId}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: `Issue ${i}`, issueTypeConfigId: taskTypeId });
    }

    const page1 = await request
      .get(`/api/projects/${projectId}/issues?page=1&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`);
    const page2 = await request
      .get(`/api/projects/${projectId}/issues?page=2&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(page1.body.meta.total).toBe(page2.body.meta.total);
    expect(page1.body.meta.total).toBe(4);
  });
});
