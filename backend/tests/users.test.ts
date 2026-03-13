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
  await prisma.user.deleteMany();

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const superAdmin = await createSuperAdminUser();
  superAdminToken = superAdmin.accessToken;

  const regularUser = await createTestUser('regular-user@test.com', 'password123', 'Regular User');
  regularUserId = regularUser.user.id;

  const adminTarget = await createTestUser('target-admin@test.com', 'password123', 'Target Admin');
  await prisma.user.update({ where: { id: adminTarget.user.id }, data: { role: 'ADMIN' } });
  adminTargetId = adminTarget.user.id;
});

describe('Users API role management', () => {
  it('PATCH /api/users/:id/role - admin cannot assign SUPER_ADMIN', async () => {
    const res = await request.patch(`/api/users/${regularUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(403);
  });

  it('PATCH /api/users/:id/role - admin cannot change another admin role', async () => {
    const res = await request.patch(`/api/users/${adminTargetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(403);
  });

  it('PATCH /api/users/:id/role - super admin can assign SUPER_ADMIN', async () => {
    const res = await request.patch(`/api/users/${regularUserId}/role`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('SUPER_ADMIN');
  });

  it('PATCH /api/users/:id/role - super admin can change an admin role', async () => {
    const res = await request.patch(`/api/users/${adminTargetId}/role`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('MANAGER');
  });

  it('PATCH /api/users/:id/role - super admin cannot remove their own SUPER_ADMIN role', async () => {
    const currentSuperAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: 'super-admin@test.com' },
      select: { id: true },
    });

    const res = await request.patch(`/api/users/${currentSuperAdmin.id}/role`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(403);
  });
});
