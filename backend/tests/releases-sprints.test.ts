import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let managerToken: string;
let userToken: string;
let projectId: string;
let releaseId: string;
let sprintId: string;
let issueId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.release.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Admin
  const adminReg = await request.post('/api/auth/register').send({
    email: 'admin-rel@test.com', password: 'Password123', name: 'Admin Rel',
  });
  await prisma.userSystemRole.upsert({ where: { userId_role: { userId: adminReg.body.user.id, role: 'ADMIN' } }, create: { userId: adminReg.body.user.id, role: 'ADMIN' }, update: {} });
  const adminLogin = await request.post('/api/auth/login').send({ email: 'admin-rel@test.com', password: 'Password123' });
  adminToken = adminLogin.body.accessToken;

  // Manager
  const mgrReg = await request.post('/api/auth/register').send({
    email: 'mgr-rel@test.com', password: 'Password123', name: 'Mgr Rel',
  });
  await prisma.userSystemRole.upsert({ where: { userId_role: { userId: mgrReg.body.user.id, role: 'MANAGER' } }, create: { userId: mgrReg.body.user.id, role: 'MANAGER' }, update: {} });
  const mgrLogin = await request.post('/api/auth/login').send({ email: 'mgr-rel@test.com', password: 'Password123' });
  managerToken = mgrLogin.body.accessToken;

  // User
  const userReg = await request.post('/api/auth/register').send({
    email: 'user-rel@test.com', password: 'Password123', name: 'User Rel',
  });
  const userLogin = await request.post('/api/auth/login').send({ email: 'user-rel@test.com', password: 'Password123' });
  userToken = userLogin.body.accessToken;

  // Project
  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Release Test Project', key: 'RELTEST' });
  projectId = proj.body.id;

  // Release
  const rel = await request.post(`/api/projects/${projectId}/releases`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0.0', level: 'MINOR' });
  releaseId = rel.body.id;

  // Sprint
  const sprint = await request.post(`/api/projects/${projectId}/sprints`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sprint 1' });
  sprintId = sprint.body.id;

  // Issue
  const issue = await request.post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Test Issue', type: 'TASK', priority: 'MEDIUM' });
  issueId = issue.body.id;
});

// =============================================
// Sprint management in release
// =============================================

describe('POST /releases/:id/sprints', () => {
  it('ADMIN can add sprint to release', async () => {
    const res = await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify sprint is linked
    const sprints = await request.get(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sprints.body).toHaveLength(1);
    expect(sprints.body[0].id).toBe(sprintId);
  });

  it('MANAGER can add sprint to release', async () => {
    const res = await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ sprintIds: [sprintId] });
    expect(res.status).toBe(200);
  });

  it('USER cannot add sprint to release (403)', async () => {
    const res = await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ sprintIds: [sprintId] });
    expect(res.status).toBe(403);
  });

  it('cannot add sprint from different project (400)', async () => {
    const otherProj = await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Other Project', key: 'OTHR' });
    const otherSprint = await request.post(`/api/projects/${otherProj.body.id}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Other Sprint' });

    const res = await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [otherSprint.body.id] });
    expect(res.status).toBe(400);
  });

  it('cannot add sprint already in another release (400)', async () => {
    const otherRel = await request.post(`/api/projects/${projectId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '2.0.0', level: 'MAJOR' });
    await request.post(`/api/releases/${otherRel.body.id}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });

    const res = await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already assigned/i);
  });
});

describe('POST /releases/:id/sprints/remove', () => {
  it('removes sprint from release', async () => {
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });

    const res = await request.post(`/api/releases/${releaseId}/sprints/remove`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    expect(res.status).toBe(200);

    const sprints = await request.get(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sprints.body).toHaveLength(0);
  });
});

// =============================================
// Deprecated endpoints → 410 Gone
// (markReleaseReady / markReleaseReleased replaced by workflow transitions)
// =============================================

describe('POST /releases/:id/ready — deprecated', () => {
  it('returns 410 Gone', async () => {
    const res = await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Deprecated');
  });
});

describe('POST /releases/:id/released — deprecated', () => {
  it('returns 410 Gone', async () => {
    const res = await request.post(`/api/releases/${releaseId}/released`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Deprecated');
  });
});

// =============================================
// GET /releases/:id/readiness
// =============================================

describe('GET /releases/:id/readiness', () => {
  it('returns readiness stats', async () => {
    const res = await request.get(`/api/releases/${releaseId}/readiness`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalSprints: 0,
      closedSprints: 0,
      totalItems: 0,
      doneItems: 0,
      completionPercent: 0,
    });
  });

  it('reflects added sprint', async () => {
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });

    const res = await request.get(`/api/releases/${releaseId}/readiness`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalSprints).toBe(1);
    expect(res.body.closedSprints).toBe(0);
  });

  it('reflects added release item', async () => {
    await request.post(`/api/releases/${releaseId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });

    const res = await request.get(`/api/releases/${releaseId}/readiness`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
  });
});
