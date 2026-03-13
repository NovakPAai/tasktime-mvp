import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { promoteUserToSuperAdmin } from '../src/modules/users/super-admin-bootstrap.service.js';
import { createAdminUser, request } from './helpers.js';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

describe('promoteUserToSuperAdmin', () => {
  it('promotes an existing user and invalidates refresh tokens', async () => {
    const admin = await createAdminUser();

    await promoteUserToSuperAdmin({ email: admin.user.email });

    const promoted = await prisma.user.findUniqueOrThrow({
      where: { email: admin.user.email },
      select: { role: true },
    });
    expect(promoted.role).toBe('SUPER_ADMIN');

    const oldRefresh = await request.post('/api/auth/refresh').send({
      refreshToken: admin.refreshToken,
    });
    expect(oldRefresh.status).toBe(401);

    const newLogin = await request.post('/api/auth/login').send({
      email: admin.user.email,
      password: 'password123',
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user.role).toBe('SUPER_ADMIN');
  });
});
