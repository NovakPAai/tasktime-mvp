import { describe, it, expect, beforeEach } from 'vitest';
import { request } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

describe('Auth API', () => {
  it('POST /api/auth/register - should register a new user', async () => {
    const res = await request.post('/api/auth/register').send({
      email: 'new@test.com',
      password: 'password123',
      name: 'New User',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@test.com');
    expect(res.body.user.role).toBe('USER');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('POST /api/auth/register - should reject duplicate email', async () => {
    await request.post('/api/auth/register').send({
      email: 'dup@test.com', password: 'password123', name: 'First',
    });
    const res = await request.post('/api/auth/register').send({
      email: 'dup@test.com', password: 'password123', name: 'Second',
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/auth/register - should reject short password', async () => {
    const res = await request.post('/api/auth/register').send({
      email: 'short@test.com', password: '123', name: 'Short',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login - should login with valid credentials', async () => {
    await request.post('/api/auth/register').send({
      email: 'login@test.com', password: 'password123', name: 'Login',
    });
    const res = await request.post('/api/auth/login').send({
      email: 'login@test.com', password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /api/auth/login - should reject wrong password', async () => {
    await request.post('/api/auth/register').send({
      email: 'wrong@test.com', password: 'password123', name: 'Wrong',
    });
    const res = await request.post('/api/auth/login').send({
      email: 'wrong@test.com', password: 'wrongpass',
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me - should return current user', async () => {
    const reg = await request.post('/api/auth/register').send({
      email: 'me@test.com', password: 'password123', name: 'Me',
    });
    const res = await request.get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@test.com');
  });

  it('GET /api/auth/me - should reject without token', async () => {
    const res = await request.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/refresh - should refresh tokens', async () => {
    const reg = await request.post('/api/auth/register').send({
      email: 'refresh@test.com', password: 'password123', name: 'Refresh',
    });
    const res = await request.post('/api/auth/refresh').send({
      refreshToken: reg.body.refreshToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('POST /api/auth/logout - should invalidate refresh token', async () => {
    const reg = await request.post('/api/auth/register').send({
      email: 'logout@test.com', password: 'password123', name: 'Logout',
    });
    await request.post('/api/auth/logout').send({
      refreshToken: reg.body.refreshToken,
    });
    const res = await request.post('/api/auth/refresh').send({
      refreshToken: reg.body.refreshToken,
    });
    expect(res.status).toBe(401);
  });
});
