import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let userToken: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const adminReg = await request.post('/api/auth/register').send({
    email: 'admin-teams@test.com',
    password: 'password123',
    name: 'Admin Teams',
  });
  await prisma.user.update({
    where: { id: adminReg.body.user.id },
    data: { role: 'ADMIN' },
  });
  const adminLogin = await request
    .post('/api/auth/login')
    .send({ email: 'admin-teams@test.com', password: 'password123' });
  adminToken = adminLogin.body.accessToken;

  const userReg = await request.post('/api/auth/register').send({
    email: 'user-teams@test.com',
    password: 'password123',
    name: 'User Teams',
  });
  userToken = userReg.body.accessToken;
});

describe('Teams API', () => {
  it('POST /api/teams - admin can create team', async () => {
    const res = await request
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team A', description: 'Test team' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Team A');
  });

  it('POST /api/teams - user cannot create team', async () => {
    const res = await request
      .post('/api/teams')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Team B' });

    expect(res.status).toBe(403);
  });

  it('GET /api/teams - lists teams for authenticated users', async () => {
    await request
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team C' });

    const res = await request.get('/api/teams').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('PUT /api/teams/:id/members - admin can set team members', async () => {
    const teamRes = await request
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team D' });

    const teamId = teamRes.body.id as string;

    const user = await prisma.user.findFirstOrThrow({ where: { email: 'user-teams@test.com' } });

    const membersRes = await request
      .put(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [user.id] });

    expect(membersRes.status).toBe(200);
    expect(membersRes.body.ok).toBe(true);

    const fetched = await request
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(fetched.status).toBe(200);
    expect(fetched.body.members.length).toBe(1);
    expect(fetched.body.members[0].user.email).toBe('user-teams@test.com');
  });

  it('DELETE /api/teams/:id - admin can delete team', async () => {
    const teamRes = await request
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team E' });

    const teamId = teamRes.body.id as string;

    const delRes = await request
      .delete(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(204);

    const listRes = await request.get('/api/teams').set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(0);
  });
});
