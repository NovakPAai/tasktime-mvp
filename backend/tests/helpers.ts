import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/shared/utils/jwt.js';

export const app = createApp();
export const request = supertest(app);

export async function createTestUser(
  email = 'test@test.com',
  password = 'Password123',
  name = 'Test User',
) {
  const res = await request.post('/api/auth/register').send({ email, password, name });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

async function addSystemRole(userId: string, role: string) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.userSystemRole.upsert({
    where: { userId_role: { userId, role: role as never } },
    create: { userId, role: role as never },
    update: {},
  });
  await prisma.$disconnect();
}

export async function createAdminUser() {
  const { user } = await createTestUser('admin@test.com', 'Password123', 'Admin');
  await addSystemRole(user.id, 'ADMIN');

  // Re-login to get updated token with ADMIN role
  const res = await request.post('/api/auth/login').send({ email: 'admin@test.com', password: 'Password123' });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export async function createManagerUser() {
  const { user } = await createTestUser('manager@test.com', 'Password123', 'Manager');
  // MANAGER system role removed; AUDITOR is the closest equivalent (read-only admin access)
  await addSystemRole(user.id, 'AUDITOR');

  const res = await request.post('/api/auth/login').send({ email: 'manager@test.com', password: 'Password123' });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export async function createSuperAdminUser() {
  const { user } = await createTestUser('super-admin@test.com', 'Password123', 'Super Admin');
  await addSystemRole(user.id, 'SUPER_ADMIN');

  const res = await request.post('/api/auth/login').send({ email: 'super-admin@test.com', password: 'Password123' });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export function signSuperAdminToken(user: { id: string; email: string }) {
  return signAccessToken({
    userId: user.id,
    email: user.email,
    systemRoles: ['SUPER_ADMIN'],
  });
}

/**
 * Returns the IssueTypeConfig ID for a given systemKey (e.g. 'TASK', 'EPIC').
 * These configs are seeded by migration and persist across test runs.
 */
export async function getIssueTypeConfigId(systemKey: string): Promise<string> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const config = await prisma.issueTypeConfig.findUniqueOrThrow({ where: { systemKey } });
    return config.id;
  } finally {
    await prisma.$disconnect();
  }
}
