import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createAdminUser, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let userToken: string;

const DEFAULT_SCHEME_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(async () => {
  // Explicit ordered cleanup: remove child rows first to avoid depending on cascade semantics
  // or row ordering. Keep the seeded default scheme so tests relying on it do not have to
  // recreate roles manually.
  await prisma.auditLog.deleteMany();
  await prisma.userProjectRole.deleteMany();
  await prisma.projectRoleSchemeProject.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectRoleScheme.deleteMany({
    where: { id: { not: DEFAULT_SCHEME_ID } },
  });
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Ensure the default scheme exists with system roles (not seeded by setup.ts)
  await prisma.projectRoleScheme.upsert({
    where: { id: DEFAULT_SCHEME_ID },
    update: {},
    create: {
      id: DEFAULT_SCHEME_ID,
      name: 'Default',
      description: 'Схема доступа по умолчанию',
      isDefault: true,
    },
  });
  for (const [key, name, color] of [
    ['ADMIN', 'Администратор', '#fa8c16'],
    ['MANAGER', 'Менеджер', '#1677ff'],
    ['USER', 'Участник', '#52c41a'],
    ['VIEWER', 'Наблюдатель', '#d9d9d9'],
  ] as [string, string, string][]) {
    await prisma.projectRoleDefinition.upsert({
      where: { schemeId_key: { schemeId: DEFAULT_SCHEME_ID, key } },
      update: {},
      create: { schemeId: DEFAULT_SCHEME_ID, key, name, color, isSystem: true },
    });
  }

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const user = await createTestUser('plain-user@test.com', 'Password123', 'Plain User');
  userToken = user.accessToken;
});

describe('GET /api/admin/role-schemes', () => {
  it('200 для ADMIN', async () => {
    const res = await request.get('/api/admin/role-schemes').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('403 для USER', async () => {
    const res = await request.get('/api/admin/role-schemes').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('401 без токена', async () => {
    const res = await request.get('/api/admin/role-schemes');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/role-schemes', () => {
  it('201 для ADMIN — создаёт схему', async () => {
    const res = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Scheme', description: 'desc' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Scheme');
    expect(res.body.id).toBeDefined();
  });

  it('400 — name обязательно', async () => {
    const res = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'no name' });

    expect(res.status).toBe(400);
  });

  it('403 для USER', async () => {
    const res = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'X' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/role-schemes/:id', () => {
  it('400 SCHEME_IN_USE при попытке удалить схему с привязанным проектом', async () => {
    // Create a project and a scheme, then attach
    const projectRes = await request
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Project', key: 'TST' });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.id as string;

    const schemeRes = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Busy Scheme' });
    expect(schemeRes.status).toBe(201);
    const schemeId = schemeRes.body.id as string;

    await request
      .post(`/api/admin/role-schemes/${schemeId}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId });

    const delRes = await request
      .delete(`/api/admin/role-schemes/${schemeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(400);
    expect(delRes.body.error).toBe('SCHEME_IN_USE');
  });

  it('400 при попытке удалить дефолтную схему', async () => {
    const res = await request
      .delete(`/api/admin/role-schemes/${DEFAULT_SCHEME_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot delete the default scheme');
  });
});

describe('POST /api/admin/role-schemes/:id/projects', () => {
  it('привязывает проект и поддерживает смену схемы (upsert)', async () => {
    const projectRes = await request
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Proj A', key: 'PA' });
    const projectId = projectRes.body.id as string;

    const scheme1Res = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scheme 1' });
    const scheme1Id = scheme1Res.body.id as string;

    const scheme2Res = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scheme 2' });
    const scheme2Id = scheme2Res.body.id as string;

    // Attach to scheme1
    const r1 = await request
      .post(`/api/admin/role-schemes/${scheme1Id}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId });
    expect(r1.status).toBe(201);

    // Re-attach to scheme2 — should succeed (upsert). 200 on update vs 201 on first attach.
    const r2 = await request
      .post(`/api/admin/role-schemes/${scheme2Id}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId });
    expect(r2.status).toBe(200);

    // Verify in DB
    const binding = await prisma.projectRoleSchemeProject.findUnique({ where: { projectId } });
    expect(binding?.schemeId).toBe(scheme2Id);
  });
});

describe('PATCH /api/admin/role-schemes/:id/roles/:roleId/permissions', () => {
  it('сохраняет матрицу прав и возвращает роль с permissions', async () => {
    // Get a role from the default scheme
    const schemeRes = await request
      .get(`/api/admin/role-schemes/${DEFAULT_SCHEME_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(schemeRes.status).toBe(200);

    const role = (schemeRes.body.roles as { id: string; key: string }[]).find(r => r.key === 'VIEWER');
    expect(role).toBeDefined();
    const roleId = role!.id;

    const res = await request
      .patch(`/api/admin/role-schemes/${DEFAULT_SCHEME_ID}/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: { ISSUES_VIEW: true, ISSUES_CREATE: false } });

    expect(res.status).toBe(200);
    expect(res.body.permissions).toBeDefined();
    const permView = (res.body.permissions as { permission: string; granted: boolean }[]).find(
      p => p.permission === 'ISSUES_VIEW',
    );
    expect(permView?.granted).toBe(true);
    // Only granted=true permissions are stored; absence of a row means "not granted".
    const permCreate = (res.body.permissions as { permission: string; granted: boolean }[]).find(
      p => p.permission === 'ISSUES_CREATE',
    );
    expect(permCreate).toBeUndefined();
  });
});

describe('DELETE /api/admin/role-schemes/:id/roles/:roleId', () => {
  it('400 при попытке удалить системную роль', async () => {
    const schemeRes = await request
      .get(`/api/admin/role-schemes/${DEFAULT_SCHEME_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const systemRole = (schemeRes.body.roles as { id: string; isSystem: boolean }[]).find(
      r => r.isSystem,
    );
    expect(systemRole).toBeDefined();

    const res = await request
      .delete(`/api/admin/role-schemes/${DEFAULT_SCHEME_ID}/roles/${systemRole!.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot delete a system role');
  });

  it('204/200 удаляет кастомную роль без участников', async () => {
    // Create custom scheme with a custom role
    const schemeRes = await request
      .post('/api/admin/role-schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Custom Scheme' });
    const schemeId = schemeRes.body.id as string;

    const roleRes = await request
      .post(`/api/admin/role-schemes/${schemeId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dev', key: 'DEV' });
    expect(roleRes.status).toBe(201);
    const roleId = roleRes.body.id as string;

    const delRes = await request
      .delete(`/api/admin/role-schemes/${schemeId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);
  });
});
