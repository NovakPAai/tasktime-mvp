/**
 * TTMP-160 PR-1 — integration tests for checkpoint-types & checkpoint-templates routers.
 *
 * Covers:
 *   - RBAC: plain USER → 403; RELEASE_MANAGER, ADMIN, SUPER_ADMIN → 2xx (SEC-1)
 *   - CheckpointType CRUD (FR-1) + 409 on delete when used by a release checkpoint
 *   - CheckpointTemplate CRUD + clone (FR-2) + 400 when referencing a missing type
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let superAdminToken: string;
let adminToken: string;
let rmToken: string;
let plainToken: string;

const VALID_CRITERIA = [
  { type: 'STATUS_IN', categories: ['DONE', 'IN_PROGRESS'] },
];

async function grantSystemRole(userId: string, role: string) {
  await prisma.userSystemRole.upsert({
    where: { userId_role: { userId, role: role as never } },
    create: { userId, role: role as never },
    update: {},
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await request.post('/api/auth/login').send({ email, password: 'Password123' });
  return res.body.accessToken as string;
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.checkpointViolationEvent.deleteMany();
  await prisma.releaseCheckpoint.deleteMany();
  await prisma.checkpointTemplateItem.deleteMany();
  await prisma.checkpointTemplate.deleteMany();
  await prisma.checkpointType.deleteMany();
  await prisma.releaseBurndownSnapshot.deleteMany();
  await prisma.release.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const superRes = await createTestUser('super@ttmp160.test', 'Password123', 'Super');
  await grantSystemRole(superRes.user.id, 'SUPER_ADMIN');
  superAdminToken = await loginAs('super@ttmp160.test');

  const adminRes = await createTestUser('admin@ttmp160.test', 'Password123', 'Admin');
  await grantSystemRole(adminRes.user.id, 'ADMIN');
  adminToken = await loginAs('admin@ttmp160.test');

  const rmRes = await createTestUser('rm@ttmp160.test', 'Password123', 'Release Manager');
  await grantSystemRole(rmRes.user.id, 'RELEASE_MANAGER');
  rmToken = await loginAs('rm@ttmp160.test');

  const plainRes = await createTestUser('plain@ttmp160.test', 'Password123', 'Plain User');
  plainToken = plainRes.accessToken;
});

// ============================================================
// /api/admin/checkpoint-types
// ============================================================

describe('POST /api/admin/checkpoint-types', () => {
  const body = {
    name: 'Code freeze',
    color: '#52C41A',
    weight: 'HIGH',
    offsetDays: -7,
    criteria: VALID_CRITERIA,
  };

  it('SUPER_ADMIN can create a checkpoint type', async () => {
    const res = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Code freeze');
    expect(res.body.weight).toBe('HIGH');
    expect(res.body.isActive).toBe(true);
  });

  it('ADMIN can create a checkpoint type', async () => {
    const res = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...body, name: 'By admin' });
    expect(res.status).toBe(201);
  });

  it('RELEASE_MANAGER can create a checkpoint type', async () => {
    const res = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ ...body, name: 'By RM' });
    expect(res.status).toBe(201);
  });

  it('plain USER cannot create a checkpoint type (403)', async () => {
    const res = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${plainToken}`)
      .send(body);
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request.post('/api/admin/checkpoint-types').send(body);
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid criteria shape', async () => {
    const res = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...body, criteria: [{ type: 'BOGUS' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 409 on duplicate name', async () => {
    await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    const dup = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('CHECKPOINT_TYPE_NAME_TAKEN');
  });

  it('persists an audit log for checkpoint_type.created', async () => {
    const res = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...body, name: 'Audited' });
    expect(res.status).toBe(201);
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'checkpoint_type', entityId: res.body.id },
    });
    expect(audit?.action).toBe('checkpoint_type.created');
  });
});

describe('GET /api/admin/checkpoint-types', () => {
  it('returns created types sorted by name', async () => {
    await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'B-type', color: '#888888', offsetDays: 0, criteria: VALID_CRITERIA });
    await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'A-type', color: '#888888', offsetDays: 0, criteria: VALID_CRITERIA });

    const res = await request
      .get('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.map((t: { name: string }) => t.name)).toEqual(['A-type', 'B-type']);
  });

  it('plain USER cannot list (403)', async () => {
    const res = await request
      .get('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/checkpoint-types/:id', () => {
  it('updates name and criteria', async () => {
    const created = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'To-update', color: '#888888', offsetDays: 0, criteria: VALID_CRITERIA });

    const res = await request
      .patch(`/api/admin/checkpoint-types/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated', criteria: [{ type: 'ASSIGNEE_SET' }] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
    expect(res.body.criteria).toEqual([{ type: 'ASSIGNEE_SET' }]);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request
      .patch('/api/admin/checkpoint-types/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/checkpoint-types/:id', () => {
  it('deletes an unused type', async () => {
    const created = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete-me', color: '#888888', offsetDays: 0, criteria: VALID_CRITERIA });

    const res = await request
      .delete(`/api/admin/checkpoint-types/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 409 CHECKPOINT_TYPE_IN_USE when used by a release checkpoint', async () => {
    // Create type, release, and a ReleaseCheckpoint directly via Prisma.
    const created = await request
      .post('/api/admin/checkpoint-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'In-use', color: '#888888', offsetDays: -3, criteria: VALID_CRITERIA });

    const project = await prisma.project.create({
      data: { name: 'Test Project', key: 'TTMP160' },
    });
    const release = await prisma.release.create({
      data: { name: 'rel-1', projectId: project.id, plannedDate: new Date('2026-06-01') },
    });
    await prisma.releaseCheckpoint.create({
      data: {
        releaseId: release.id,
        checkpointTypeId: created.body.id,
        criteriaSnapshot: VALID_CRITERIA,
        offsetDaysSnapshot: -3,
        deadline: new Date('2026-05-29'),
      },
    });

    const res = await request
      .delete(`/api/admin/checkpoint-types/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CHECKPOINT_TYPE_IN_USE');
    expect(res.body.activeInstances).toHaveLength(1);
    expect(res.body.activeInstances[0].releaseName).toBe('rel-1');
  });
});

// ============================================================
// /api/admin/checkpoint-templates
// ============================================================

async function createType(name: string, token = adminToken): Promise<string> {
  const res = await request
    .post('/api/admin/checkpoint-types')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, color: '#888888', offsetDays: 0, criteria: VALID_CRITERIA });
  return res.body.id;
}

describe('POST /api/admin/checkpoint-templates', () => {
  it('RELEASE_MANAGER can create a template', async () => {
    const typeId = await createType('Freeze');
    const res = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ name: 'Standard', items: [{ checkpointTypeId: typeId, orderIndex: 0 }] });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.createdBy?.email).toBe('rm@ttmp160.test');
  });

  it('plain USER cannot create a template (403)', async () => {
    const typeId = await createType('Freeze2');
    const res = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ name: 'Standard', items: [{ checkpointTypeId: typeId, orderIndex: 0 }] });
    expect(res.status).toBe(403);
  });

  it('returns 400 when referencing a missing type', async () => {
    const res = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Broken',
        items: [{ checkpointTypeId: '00000000-0000-0000-0000-000000000000', orderIndex: 0 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CHECKPOINT_TYPES_NOT_FOUND');
  });

  it('returns 400 on duplicate types within a template', async () => {
    const typeId = await createType('Once');
    const res = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'DupItems',
        items: [
          { checkpointTypeId: typeId, orderIndex: 0 },
          { checkpointTypeId: typeId, orderIndex: 1 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 409 on duplicate template name', async () => {
    const typeId = await createType('DupName');
    await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Same', items: [{ checkpointTypeId: typeId, orderIndex: 0 }] });
    const dup = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Same', items: [{ checkpointTypeId: typeId, orderIndex: 0 }] });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('CHECKPOINT_TEMPLATE_NAME_TAKEN');
  });
});

describe('PATCH /api/admin/checkpoint-templates/:id', () => {
  it('replaces items when items is provided', async () => {
    const t1 = await createType('T1');
    const t2 = await createType('T2');
    const created = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Patchable', items: [{ checkpointTypeId: t1, orderIndex: 0 }] });

    const res = await request
      .patch(`/api/admin/checkpoint-templates/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ checkpointTypeId: t2, orderIndex: 0 }] });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].checkpointTypeId).toBe(t2);
  });
});

describe('POST /api/admin/checkpoint-templates/:id/clone', () => {
  it('clones items with a default "(копия)" suffix', async () => {
    const t1 = await createType('Cloned type');
    const source = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Source',
        description: 'src',
        items: [{ checkpointTypeId: t1, orderIndex: 0 }],
      });

    const res = await request
      .post(`/api/admin/checkpoint-templates/${source.body.id}/clone`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Source (копия)');
    expect(res.body.description).toBe('src');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].checkpointTypeId).toBe(t1);
    expect(res.body.id).not.toBe(source.body.id);
  });

  it('honours a custom clone name', async () => {
    const t1 = await createType('Ct-2');
    const source = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Src-2', items: [{ checkpointTypeId: t1, orderIndex: 0 }] });

    const res = await request
      .post(`/api/admin/checkpoint-templates/${source.body.id}/clone`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'My Clone' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Clone');
  });
});

describe('DELETE /api/admin/checkpoint-templates/:id', () => {
  it('deletes template and its items (cascade)', async () => {
    const t1 = await createType('DelTemplate');
    const created = await request
      .post('/api/admin/checkpoint-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'DelMe', items: [{ checkpointTypeId: t1, orderIndex: 0 }] });

    const res = await request
      .delete(`/api/admin/checkpoint-templates/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const remaining = await prisma.checkpointTemplateItem.findMany({
      where: { templateId: created.body.id },
    });
    expect(remaining).toHaveLength(0);
  });
});
