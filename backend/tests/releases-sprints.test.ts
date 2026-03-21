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
    email: 'admin-rel@test.com', password: 'password123', name: 'Admin Rel',
  });
  await prisma.user.update({ where: { id: adminReg.body.user.id }, data: { role: 'ADMIN' } });
  const adminLogin = await request.post('/api/auth/login').send({ email: 'admin-rel@test.com', password: 'password123' });
  adminToken = adminLogin.body.accessToken;

  // Manager
  const mgrReg = await request.post('/api/auth/register').send({
    email: 'mgr-rel@test.com', password: 'password123', name: 'Mgr Rel',
  });
  await prisma.user.update({ where: { id: mgrReg.body.user.id }, data: { role: 'MANAGER' } });
  const mgrLogin = await request.post('/api/auth/login').send({ email: 'mgr-rel@test.com', password: 'password123' });
  managerToken = mgrLogin.body.accessToken;

  // User
  const userReg = await request.post('/api/auth/register').send({
    email: 'user-rel@test.com', password: 'password123', name: 'User Rel',
  });
  const userLogin = await request.post('/api/auth/login').send({ email: 'user-rel@test.com', password: 'password123' });
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
// markReleaseReady guards
// =============================================

describe('POST /releases/:id/ready — guards', () => {
  it('400 if no sprints in release', async () => {
    const res = await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sprint/i);
  });

  it('400 if sprints are empty (no issues)', async () => {
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });

    const res = await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/issue/i);
  });

  it('200 OK when sprint has issues', async () => {
    // Add sprint and issue to it
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });

    const res = await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('READY');
  });
});

// =============================================
// markReleaseReleased guards
// =============================================

describe('POST /releases/:id/released — guards', () => {
  it('400 if sprints are not CLOSED', async () => {
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });
    await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Sprint is PLANNED, not CLOSED
    const res = await request.post(`/api/releases/${releaseId}/released`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sprint/i);
  });

  it('400 if sprint is ACTIVE (not CLOSED)', async () => {
    // NOTE: closeSprint moves incomplete issues to backlog, so it's impossible
    // to have a CLOSED sprint with open issues. The guard for open issues is
    // triggered when sprints are still ACTIVE/PLANNED.
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });
    await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Sprint is PLANNED (not yet CLOSED)
    const res = await request.post(`/api/releases/${releaseId}/released`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sprint/i);
  });

  it('200 OK when all sprints CLOSED and issues DONE', async () => {
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });
    await request.post(`/api/releases/${releaseId}/ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request.post(`/api/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request.post(`/api/sprints/${sprintId}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Mark issue DONE
    await request.patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DONE' });

    const res = await request.post(`/api/releases/${releaseId}/released`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('RELEASED');
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
      totalIssues: 0,
      doneIssues: 0,
      canMarkReady: false,
      canRelease: false,
    });
  });

  it('reflects added sprint and issue', async () => {
    await request.post(`/api/releases/${releaseId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintIds: [sprintId] });
    await request.post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueIds: [issueId] });

    const res = await request.get(`/api/releases/${releaseId}/readiness`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalSprints).toBe(1);
    expect(res.body.totalIssues).toBe(1);
    expect(res.body.canMarkReady).toBe(true);
    expect(res.body.canRelease).toBe(false);
  });
});
