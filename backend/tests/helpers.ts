import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/shared/utils/jwt.js';

export const app = createApp();
export const request = supertest(app);

export async function createTestUser(
  email = 'test@test.com',
  password = 'password123',
  name = 'Test User',
) {
  const res = await request.post('/api/auth/register').send({ email, password, name });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export async function createAdminUser() {
  const { user, accessToken } = await createTestUser('admin@test.com', 'password123', 'Admin');
  // Directly update role in DB
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  await prisma.$disconnect();

  // Re-login to get updated token with ADMIN role
  const res = await request.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export async function createManagerUser() {
  const { user, accessToken } = await createTestUser('manager@test.com', 'password123', 'Manager');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.user.update({ where: { id: user.id }, data: { role: 'MANAGER' } });
  await prisma.$disconnect();

  const res = await request.post('/api/auth/login').send({ email: 'manager@test.com', password: 'password123' });
  return {
    user: res.body.user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export async function createSuperAdminUser() {
  const { user, accessToken } = await createTestUser('super-admin@test.com', 'password123', 'Super Admin');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'SUPER_ADMIN' WHERE id = '${user.id}'`);
  await prisma.$disconnect();

  const res = await request.post('/api/auth/login').send({ email: 'super-admin@test.com', password: 'password123' });
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
    role: 'SUPER_ADMIN',
  });
}
