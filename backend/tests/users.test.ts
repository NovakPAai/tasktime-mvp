import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { createAdminUser, createSuperAdminUser, createTestUser, request } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let superAdminToken: string;
let regularUserId: string;
let adminTargetId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const superAdmin = await createSuperAdminUser();
  superAdminToken = superAdmin.accessToken;

  const regularUser = await createTestUser('regular-user@test.com', 'Password123', 'Regular User');
  regularUserId = regularUser.user.id;

  const adminTarget = await createTestUser('target-admin@test.com', 'Password123', 'Target Admin');
  await prisma.userSystemRole.create({ data: { userId: adminTarget.user.id, role: 'ADMIN' } });
  adminTargetId = adminTarget.user.id;
});

describe('Users API — deprecated role endpoint', () => {
  it('PATCH /api/users/:id/role - returns 410 Gone', async () => {
    const res = await request.patch(`/api/users/${regularUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(410);
  });
});

describe('System roles API', () => {
  it('PUT /api/admin/users/:id/system-roles - super admin can set roles', async () => {
    const res = await request.put(`/api/admin/users/${regularUserId}/system-roles`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ roles: ['USER', 'ADMIN'] });

    expect(res.status).toBe(200);
    expect(res.body.systemRoles).toContain('ADMIN');
    expect(res.body.systemRoles).toContain('USER');
  });

  it('PUT /api/admin/users/:id/system-roles - admin can set roles (non-SUPER_ADMIN)', async () => {
    const res = await request.put(`/api/admin/users/${regularUserId}/system-roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roles: ['USER', 'RELEASE_MANAGER'] });

    expect(res.status).toBe(200);
    expect(res.body.systemRoles).toContain('RELEASE_MANAGER');
  });

  it('POST /api/admin/users/:id/system-roles - add a role', async () => {
    const res = await request.post(`/api/admin/users/${regularUserId}/system-roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'AUDITOR' });

    expect(res.status).toBe(201);
  });

  it('DELETE /api/admin/users/:id/system-roles/:role - remove a role', async () => {
    const res = await request.delete(`/api/admin/users/${adminTargetId}/system-roles/ADMIN`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(204);
  });

  it('GET /api/admin/users/:id/system-roles - returns systemRoles array', async () => {
    const res = await request.get(`/api/admin/users/${regularUserId}/system-roles`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.systemRoles)).toBe(true);
  });
});
