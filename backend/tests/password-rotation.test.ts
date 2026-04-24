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
    const user = await createTestUser('owner@test.com', 'Password123', 'Owner');

    await rotateUserPassword({
      email: 'owner@test.com',
      newPassword: 'new-strong-password-123',
    });

    const oldLogin = await request.post('/api/auth/login').send({
      email: 'owner@test.com',
      password: 'Password123',
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

  // clearMustChangePassword: true — CLI-скрипт path (ротация постоянного пароля).
  // Контраст: default false preserves флаг (admin /reset-password endpoint).
  it('clears mustChangePassword when clearMustChangePassword=true', async () => {
    await createTestUser('temp@test.com', 'Temp1234', 'TempUser');
    await prisma.user.update({
      where: { email: 'temp@test.com' },
      data: { mustChangePassword: true },
    });

    await rotateUserPassword({
      email: 'temp@test.com',
      newPassword: 'new-strong-password-456',
      clearMustChangePassword: true,
    });

    const user = await prisma.user.findUnique({ where: { email: 'temp@test.com' } });
    expect(user?.mustChangePassword).toBe(false);

    // Full proof: пароль реально сменился (auth check — не только flag).
    const login = await request.post('/api/auth/login').send({
      email: 'temp@test.com',
      password: 'new-strong-password-456',
    });
    expect(login.status).toBe(200);
  });

  // Default path (admin /reset-password endpoint) — mustChangePassword preserved.
  it('preserves mustChangePassword when clearMustChangePassword is not set', async () => {
    await createTestUser('admin-reset@test.com', 'Init1234', 'AdminUser');
    await prisma.user.update({
      where: { email: 'admin-reset@test.com' },
      data: { mustChangePassword: true },
    });

    await rotateUserPassword({
      email: 'admin-reset@test.com',
      newPassword: 'admin-new-temp-789',
    });

    const user = await prisma.user.findUnique({ where: { email: 'admin-reset@test.com' } });
    expect(user?.mustChangePassword).toBe(true);
  });
});
