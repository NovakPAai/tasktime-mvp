import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { rotateUserPassword } from '../src/modules/users/password-rotation.service.js';
import { createTestUser, request } from './helpers.js';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

describe('rotateUserPassword', () => {
  it('replaces the password and invalidates refresh tokens', async () => {
    const user = await createTestUser('owner@test.com', 'password123', 'Owner');

    await rotateUserPassword({
      email: 'owner@test.com',
      newPassword: 'new-strong-password-123',
    });

    const oldLogin = await request.post('/api/auth/login').send({
      email: 'owner@test.com',
      password: 'password123',
    });
    expect(oldLogin.status).toBe(401);

    const oldRefresh = await request.post('/api/auth/refresh').send({
      refreshToken: user.refreshToken,
    });
    expect(oldRefresh.status).toBe(401);

    const newLogin = await request.post('/api/auth/login').send({
      email: 'owner@test.com',
      password: 'new-strong-password-123',
    });
    expect(newLogin.status).toBe(200);
  });
});
