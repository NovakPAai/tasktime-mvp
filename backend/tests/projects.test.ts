import { describe, it, expect, beforeEach } from 'vitest';
import { request } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let adminToken: string;
let userToken: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Create admin
  const adminReg = await request.post('/api/auth/register').send({
    email: 'admin@test.com', password: 'password123', name: 'Admin',
  });
  await prisma.user.update({ where: { id: adminReg.body.user.id }, data: { role: 'ADMIN' } });
  const adminLogin = await request.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });
  adminToken = adminLogin.body.accessToken;

  // Create regular user
  const userReg = await request.post('/api/auth/register').send({
    email: 'user@test.com', password: 'password123', name: 'User',
  });
  userToken = userReg.body.accessToken;
});

describe('Projects API', () => {
  it('POST /api/projects - admin can create project', async () => {
    const res = await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Project', key: 'TEST' });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe('TEST');
  });

  it('POST /api/projects - user cannot create project', async () => {
    const res = await request.post('/api/projects')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Test', key: 'TEST' });
    expect(res.status).toBe(403);
  });

  it('POST /api/projects - rejects duplicate key', async () => {
    await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'First', key: 'DUP' });
    const res = await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second', key: 'DUP' });
    expect(res.status).toBe(409);
  });

  it('GET /api/projects - lists projects', async () => {
    await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'P1', key: 'PONE' });
    const res = await request.get('/api/projects')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('PATCH /api/projects/:id - admin can update', async () => {
    const create = await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Old', key: 'UPD' });
    const res = await request.patch(`/api/projects/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('DELETE /api/projects/:id - admin can delete', async () => {
    const create = await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Del', key: 'DEL' });
    const res = await request.delete(`/api/projects/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});
