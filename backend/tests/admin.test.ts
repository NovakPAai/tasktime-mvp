import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createAdminUser, createManagerUser, createSuperAdminUser, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let managerToken: string;
let superAdminToken: string;
let userToken: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const manager = await createManagerUser();
  managerToken = manager.accessToken;

  const superAdmin = await createSuperAdminUser();
  superAdminToken = superAdmin.accessToken;

  const user = await createTestUser('viewer-of-admin@test.com', 'password123', 'Regular User');
  userToken = user.accessToken;
});

describe('Admin API', () => {
  it('GET /api/admin/stats - accessible for ADMIN and MANAGER', async () => {
    const resAdmin = await request.get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.counts).toBeDefined();

    const resManager = await request.get('/api/admin/stats').set('Authorization', `Bearer ${managerToken}`);
    expect(resManager.status).toBe(200);

    const resSuperAdmin = await request.get('/api/admin/stats').set('Authorization', `Bearer ${superAdminToken}`);
    expect(resSuperAdmin.status).toBe(200);

    const resUser = await request.get('/api/admin/stats').set('Authorization', `Bearer ${userToken}`);
    expect(resUser.status).toBe(403);
  });

  it('GET /api/admin/users - only ADMIN can access', async () => {
    const resAdmin = await request.get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.status).toBe(200);

    const resSuperAdmin = await request.get('/api/admin/users').set('Authorization', `Bearer ${superAdminToken}`);
    expect(resSuperAdmin.status).toBe(200);

    const resManager = await request.get('/api/admin/users').set('Authorization', `Bearer ${managerToken}`);
    expect(resManager.status).toBe(403);
  });

  it('GET /api/admin/reports/issues-by-status - returns 400 without projectId', async () => {
    const res = await request
      .get('/api/admin/reports/issues-by-status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('GET /api/admin/reports/issues-by-status - returns data for valid projectId', async () => {
    // Create a project and a couple of issues to have some data for the report
    const projectRes = await request
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Report Project', key: 'RPT' });
    expect(projectRes.status).toBe(201);

    const projectId = projectRes.body.id as string;

    await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue 1', status: 'OPEN' });

    await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Issue 2', status: 'DONE' });

    const res = await request
      .get('/api/admin/reports/issues-by-status')
      .query({ projectId })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

