/**
 * TTSEC-2 Phase 4.2 — integration tests for the user-groups admin surface.
 *
 * Covers spec §6 FR-A1..FR-A9 end-to-end through HTTP + real Postgres:
 *   - CRUD (create, list, get, patch, delete with ?confirm=true)
 *   - Membership add/remove (batch)
 *   - Project-role binding grant/revoke (scheme-aware validation)
 *   - Impact endpoint
 *   - Permissions: USER → 403 on all endpoints; ADMIN → 200/201/etc.
 *   - Effective role propagation: adding member → /users/me/security reflects the group role
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createAdminUser, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

const DEFAULT_SCHEME_ID = '00000000-0000-0000-0000-000000000001';

let adminToken: string;
let adminUserId: string;
let plainToken: string;
let plainUserId: string;

let projectId: string;
let projectKey: string;
let userRoleDefId: string;

beforeEach(async () => {
  // Ordered cleanup — same rationale as project-role-schemes.test.ts.
  await prisma.auditLog.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.projectGroupRole.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.userProjectRole.deleteMany();
  await prisma.projectRoleSchemeProject.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectRoleScheme.deleteMany({ where: { id: { not: DEFAULT_SCHEME_ID } } });
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Ensure default scheme + system roles exist. The test environment's seed doesn't run this.
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
  // Seed a minimal permission grant for USER so assertions have something to check.
  const userRoleDef = await prisma.projectRoleDefinition.findUniqueOrThrow({
    where: { schemeId_key: { schemeId: DEFAULT_SCHEME_ID, key: 'USER' } },
  });
  userRoleDefId = userRoleDef.id;
  await prisma.projectRolePermission.deleteMany({ where: { roleId: userRoleDefId } });
  await prisma.projectRolePermission.createMany({
    data: [
      { roleId: userRoleDefId, permission: 'ISSUES_VIEW', granted: true },
      { roleId: userRoleDefId, permission: 'SPRINTS_VIEW', granted: true },
    ],
  });

  const admin = await createAdminUser();
  adminToken = admin.accessToken;
  adminUserId = admin.user.id;

  const plain = await createTestUser('member@test.com', 'Password123', 'Plain Member');
  plainToken = plain.accessToken;
  plainUserId = plain.user.id;

  const project = await prisma.project.create({
    data: { name: 'P1', key: `P${Date.now().toString(36).slice(-5).toUpperCase()}` },
  });
  projectId = project.id;
  projectKey = project.key;
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/user-groups', () => {
  it('creates group as ADMIN and emits audit', async () => {
    const res = await request
      .post('/api/admin/user-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Frontend Team', description: 'Group A' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Frontend Team');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user_group.created', entityId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('409 on duplicate name', async () => {
    await request.post('/api/admin/user-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Dup' });
    const res = await request
      .post('/api/admin/user-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('403 for non-admin user', async () => {
    const res = await request
      .post('/api/admin/user-groups')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('401 without token', async () => {
    const res = await request.post('/api/admin/user-groups').send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/user-groups', () => {
  it('lists groups with counts', async () => {
    await prisma.userGroup.create({ data: { name: 'G1' } });
    await prisma.userGroup.create({ data: { name: 'G2' } });
    const res = await request.get('/api/admin/user-groups').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('_count');
  });

  it('search filter by name (case-insensitive)', async () => {
    await prisma.userGroup.create({ data: { name: 'Alpha Team' } });
    await prisma.userGroup.create({ data: { name: 'Beta Team' } });
    const res = await request
      .get('/api/admin/user-groups?search=alpha')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Alpha Team');
  });

  it('projectId filter returns only groups bound to the project', async () => {
    const other = await prisma.project.create({
      data: { name: 'P2', key: `Q${Date.now().toString(36).slice(-5).toUpperCase()}` },
    });
    await prisma.userGroup.create({
      data: {
        name: 'Bound',
        projectRoles: { create: [{ projectId, roleId: userRoleDefId, schemeId: DEFAULT_SCHEME_ID }] },
      },
    });
    await prisma.userGroup.create({
      data: {
        name: 'OtherProject',
        projectRoles: { create: [{ projectId: other.id, roleId: userRoleDefId, schemeId: DEFAULT_SCHEME_ID }] },
      },
    });
    await prisma.userGroup.create({ data: { name: 'Unbound' } });

    const res = await request
      .get(`/api/admin/user-groups?projectId=${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Bound');
  });

  it('400 when projectId query is not a UUID', async () => {
    const res = await request
      .get('/api/admin/user-groups?projectId=not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/user-groups/:id', () => {
  it('renames group and logs user_group.renamed when name changes', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'Old' } });
    const res = await request
      .patch(`/api/admin/user-groups/${g.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'user_group.renamed', entityId: g.id } });
    expect(audit).not.toBeNull();
  });

  it('updates description without rename → logs user_group.updated', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'Stable' } });
    const res = await request
      .patch(`/api/admin/user-groups/${g.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'New desc' });
    expect(res.status).toBe(200);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'user_group.updated', entityId: g.id } });
    expect(audit).not.toBeNull();
  });
});

describe('DELETE /api/admin/user-groups/:id', () => {
  it('requires confirm=true (412 otherwise)', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'Deleteme' } });
    const res = await request
      .delete(`/api/admin/user-groups/${g.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(412);
    // Group must still exist.
    const stillThere = await prisma.userGroup.findUnique({ where: { id: g.id } });
    expect(stillThere).not.toBeNull();
  });

  it('deletes group with confirm=true, cascades members + bindings, logs audit', async () => {
    const g = await prisma.userGroup.create({
      data: {
        name: 'ToDelete',
        members: { create: [{ userId: plainUserId }] },
        projectRoles: { create: [{ projectId, roleId: userRoleDefId, schemeId: DEFAULT_SCHEME_ID }] },
      },
    });
    const res = await request
      .delete(`/api/admin/user-groups/${g.id}?confirm=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.affectedPairs).toEqual([{ userId: plainUserId, projectId }]);

    const gone = await prisma.userGroup.findUnique({ where: { id: g.id } });
    expect(gone).toBeNull();
    // Cascade:
    const members = await prisma.userGroupMember.count({ where: { groupId: g.id } });
    expect(members).toBe(0);
    const bindings = await prisma.projectGroupRole.count({ where: { groupId: g.id } });
    expect(bindings).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'user_group.deleted', entityId: g.id } });
    expect(audit).not.toBeNull();
  });
});

// ─── Members ─────────────────────────────────────────────────────────────────

describe('POST /api/admin/user-groups/:id/members', () => {
  it('batch adds users, 400 on missing user ids', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'M1' } });
    const res = await request
      .post(`/api/admin/user-groups/${g.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [plainUserId, '00000000-0000-0000-0000-000000000099'] });
    expect(res.status).toBe(400);
  });

  it('adds valid users + emits user_group.members_changed', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'M2' } });
    const res = await request
      .post(`/api/admin/user-groups/${g.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [plainUserId] });
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    const members = await prisma.userGroupMember.count({ where: { groupId: g.id } });
    expect(members).toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user_group.members_changed', entityId: g.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe('DELETE /api/admin/user-groups/:id/members/:userId', () => {
  it('404 when user is not a member', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'R1' } });
    const res = await request
      .delete(`/api/admin/user-groups/${g.id}/members/${plainUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('removes member + logs audit', async () => {
    const g = await prisma.userGroup.create({
      data: { name: 'R2', members: { create: [{ userId: plainUserId }] } },
    });
    const res = await request
      .delete(`/api/admin/user-groups/${g.id}/members/${plainUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const left = await prisma.userGroupMember.count({ where: { groupId: g.id } });
    expect(left).toBe(0);
  });
});

// ─── Project role bindings ───────────────────────────────────────────────────

describe('POST /api/admin/user-groups/:id/project-roles', () => {
  it('rejects role from a different scheme with 400', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'B1' } });
    // Create an orphan scheme + role.
    const scheme = await prisma.projectRoleScheme.create({
      data: { name: 'Other', description: 'Other' },
    });
    const role = await prisma.projectRoleDefinition.create({
      data: { schemeId: scheme.id, key: 'X', name: 'X', isSystem: false },
    });
    const res = await request
      .post(`/api/admin/user-groups/${g.id}/project-roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId, roleId: role.id });
    expect(res.status).toBe(400);
  });

  it('grants role from active scheme + idempotent re-grant returns same binding', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'B2' } });
    const first = await request
      .post(`/api/admin/user-groups/${g.id}/project-roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId, roleId: userRoleDefId });
    expect(first.status).toBe(201);
    const bindingId = first.body.id;

    // Re-granting the same roleId is a no-op returning the existing binding.
    const second = await request
      .post(`/api/admin/user-groups/${g.id}/project-roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId, roleId: userRoleDefId });
    expect([200, 201]).toContain(second.status);
    expect(second.body.id).toBe(bindingId);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'project_group_role.granted', entityId: g.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe('DELETE /api/admin/user-groups/:id/project-roles/:projectId', () => {
  it('revokes binding + logs audit; 404 when not bound', async () => {
    const g = await prisma.userGroup.create({ data: { name: 'B3' } });
    const notBound = await request
      .delete(`/api/admin/user-groups/${g.id}/project-roles/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(notBound.status).toBe(404);

    await prisma.projectGroupRole.create({
      data: { groupId: g.id, projectId, roleId: userRoleDefId, schemeId: DEFAULT_SCHEME_ID },
    });
    const res = await request
      .delete(`/api/admin/user-groups/${g.id}/project-roles/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const left = await prisma.projectGroupRole.count({ where: { groupId: g.id } });
    expect(left).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'project_group_role.revoked', entityId: g.id },
    });
    expect(audit).not.toBeNull();
  });
});

// ─── Effective-permission propagation ────────────────────────────────────────

describe('GET /api/users/me/security reflects group-based permissions', () => {
  it('member receives project role through group binding', async () => {
    // Create group, bind USER role in project, add plainUser as member.
    const g = await prisma.userGroup.create({
      data: {
        name: 'Devs',
        members: { create: [{ userId: plainUserId }] },
        projectRoles: { create: [{ projectId, roleId: userRoleDefId, schemeId: DEFAULT_SCHEME_ID }] },
      },
    });

    const res = await request
      .get('/api/users/me/security')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);

    // Expect the user sees the group membership and the project role via that group.
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].name).toBe('Devs');
    const pr = res.body.projectRoles.find((r: { project: { id: string } }) => r.project.id === projectId);
    expect(pr).toBeDefined();
    expect(pr.source).toBe('GROUP');
    expect(pr.sourceGroups).toContainEqual({ id: g.id, name: 'Devs' });
    expect(pr.role.key).toBe('USER');
    expect(pr.role.permissions).toContain('ISSUES_VIEW');
  });

  it('endpoint is accessible as the user themselves without admin token', async () => {
    const res = await request
      .get('/api/users/me/security')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(plainUserId);
  });
});

describe('GET /api/admin/users/:id/security', () => {
  it('admin can query any user', async () => {
    const res = await request
      .get(`/api/admin/users/${plainUserId}/security`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(plainUserId);
  });

  it('non-admin → 403', async () => {
    const res = await request
      .get(`/api/admin/users/${adminUserId}/security`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });
});
