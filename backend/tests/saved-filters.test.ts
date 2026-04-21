import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { createTestUser, request } from './helpers.js';

const prisma = new PrismaClient();

let ownerToken: string;
let ownerId: string;
let otherToken: string;
let otherId: string;
let thirdToken: string;
let thirdId: string;

beforeEach(async () => {
  // Tables with FK fan-out from users — clear in dependency order.
  await prisma.savedFilterShare.deleteMany();
  await prisma.savedFilter.deleteMany();
  await prisma.userGroupMember.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const owner = await createTestUser('owner@test.com', 'Password123', 'Owner');
  ownerToken = owner.accessToken;
  ownerId = owner.user.id;
  const other = await createTestUser('other@test.com', 'Password123', 'Other');
  otherToken = other.accessToken;
  otherId = other.user.id;
  const third = await createTestUser('third@test.com', 'Password123', 'Third');
  thirdToken = third.accessToken;
  thirdId = third.user.id;
});

async function createFilter(
  token: string,
  body: Record<string, unknown> = { name: 'F', jql: 'project = "ABC"' },
) {
  return request.post('/api/saved-filters').set('Authorization', `Bearer ${token}`).send(body);
}

describe('SavedFilter CRUD', () => {
  it('POST /api/saved-filters - creates a PRIVATE filter by default', async () => {
    const res = await createFilter(ownerToken, {
      name: 'My HIGH issues',
      description: 'Critical & high priority',
      jql: 'priority IN (CRITICAL, HIGH)',
      columns: ['key', 'summary', 'priority'],
    });
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe(ownerId);
    expect(res.body.visibility).toBe('PRIVATE');
    expect(res.body.columns).toEqual(['key', 'summary', 'priority']);
    expect(res.body.isFavorite).toBe(false);
    expect(res.body.permission).toBe('WRITE');
  });

  it('POST /api/saved-filters - 400 on missing name', async () => {
    const res = await createFilter(ownerToken, { jql: 'x = 1' });
    expect(res.status).toBe(400);
  });

  it('POST /api/saved-filters - 401 without auth', async () => {
    const res = await request.post('/api/saved-filters').send({ name: 'X', jql: 'x = 1' });
    expect(res.status).toBe(401);
  });

  it('GET /api/saved-filters?scope=mine - returns own filters only', async () => {
    await createFilter(ownerToken, { name: 'O1', jql: 'x = 1' });
    await createFilter(otherToken, { name: 'P2', jql: 'x = 2' });

    const res = await request.get('/api/saved-filters').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.filters).toHaveLength(1);
    expect(res.body.filters[0].name).toBe('O1');
  });

  it('GET /api/saved-filters?scope=public - returns PUBLIC filters from anyone', async () => {
    await createFilter(ownerToken, { name: 'Public', jql: 'x = 1', visibility: 'PUBLIC' });
    await createFilter(otherToken, { name: 'Private', jql: 'x = 2' });

    const res = await request
      .get('/api/saved-filters?scope=public')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.filters).toHaveLength(1);
    expect(res.body.filters[0].name).toBe('Public');
  });

  it('GET /api/saved-filters/:id - 403 on PRIVATE filter owned by someone else', async () => {
    const created = await createFilter(ownerToken, { name: 'Secret', jql: 'x = 1' });
    const res = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/saved-filters/:id - 200 for owner', async () => {
    const created = await createFilter(ownerToken);
    const res = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permission).toBe('WRITE');
  });

  it('PATCH /api/saved-filters/:id - owner can update', async () => {
    const created = await createFilter(ownerToken);
    const res = await request
      .patch(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('PATCH /api/saved-filters/:id - 403 for non-owner without WRITE share', async () => {
    const created = await createFilter(ownerToken);
    const res = await request
      .patch(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('DELETE /api/saved-filters/:id - owner can delete', async () => {
    const created = await createFilter(ownerToken);
    const res = await request
      .delete(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);

    const after = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(after.status).toBe(404);
  });

  it('DELETE /api/saved-filters/:id - non-owner cannot delete even SHARED-WRITE', async () => {
    const created = await createFilter(ownerToken, {
      name: 'S', jql: 'x = 1', visibility: 'SHARED',
      sharedWith: { users: [otherId], permission: 'WRITE' },
    });
    const res = await request
      .delete(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});

describe('SavedFilter sharing', () => {
  it('POST /api/saved-filters/:id/share - owner shares with users (READ default)', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    const res = await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId] });
    expect(res.status).toBe(200);
    expect(res.body.visibility).toBe('SHARED');
    expect(res.body.shares).toHaveLength(1);
    expect(res.body.shares[0].userId).toBe(otherId);
    expect(res.body.shares[0].permission).toBe('READ');
  });

  it('SHARED + READ - shared user can GET but cannot PATCH', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId] });

    const getRes = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.permission).toBe('READ');

    const patchRes = await request
      .patch(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hacked' });
    expect(patchRes.status).toBe(403);
  });

  it('SHARED + WRITE - shared user can PATCH', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId], permission: 'WRITE' });

    const res = await request
      .patch(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ jql: 'updated = 1' });
    expect(res.status).toBe(200);
  });

  it('SHARED via group - user in group gains READ access', async () => {
    const group = await prisma.userGroup.create({ data: { name: 'QA' } });
    await prisma.userGroupMember.create({ data: { groupId: group.id, userId: thirdId } });

    const created = await createFilter(ownerToken, { name: 'Grp', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ groups: [group.id] });

    const res = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${thirdToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permission).toBe('READ');

    // A non-member still cannot read.
    const deny = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(deny.status).toBe(403);
  });

  it('POST /share - replace semantics: old shares removed on re-share', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId] });
    const reshare = await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [thirdId] });
    expect(reshare.status).toBe(200);
    expect(reshare.body.shares).toHaveLength(1);
    expect(reshare.body.shares[0].userId).toBe(thirdId);
  });

  it('POST /share - 403 if caller is not the owner', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    const res = await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ users: [thirdId] });
    expect(res.status).toBe(403);
  });

  it('POST /share - 400 if sharing with nonexistent user', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    const res = await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: ['00000000-0000-0000-0000-000000000000'] });
    expect(res.status).toBe(400);
  });

  it('POST /share with empty list downgrades SHARED → PRIVATE (PUBLIC untouched)', async () => {
    const shared = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${shared.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId] });

    const emptied = await request
      .post(`/api/saved-filters/${shared.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(emptied.status).toBe(200);
    expect(emptied.body.visibility).toBe('PRIVATE');
    expect(emptied.body.shares).toHaveLength(0);

    const pub = await createFilter(ownerToken, { name: 'P', jql: 'x = 1', visibility: 'PUBLIC' });
    const emptyOnPublic = await request
      .post(`/api/saved-filters/${pub.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(emptyOnPublic.body.visibility).toBe('PUBLIC');
  });

  it('GET /?scope=shared - returns filters shared with me, not mine, and not visible to non-recipient', async () => {
    const created = await createFilter(ownerToken, { name: 'S', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId] });

    const recipient = await request
      .get('/api/saved-filters?scope=shared')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(recipient.status).toBe(200);
    expect(recipient.body.filters).toHaveLength(1);
    expect(recipient.body.filters[0].id).toBe(created.body.id);

    // Owner's own SHARED filter must not appear in their own shared scope.
    const owner = await request
      .get('/api/saved-filters?scope=shared')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(owner.body.filters).toHaveLength(0);

    // A third party not in shares sees nothing.
    const third = await request
      .get('/api/saved-filters?scope=shared')
      .set('Authorization', `Bearer ${thirdToken}`);
    expect(third.body.filters).toHaveLength(0);
  });

  it('GET /?scope=shared - finds filter shared via group membership', async () => {
    const group = await prisma.userGroup.create({ data: { name: 'QA' } });
    await prisma.userGroupMember.create({ data: { groupId: group.id, userId: thirdId } });
    const created = await createFilter(ownerToken, { name: 'Grp', jql: 'x = 1' });
    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ groups: [group.id] });

    const res = await request
      .get('/api/saved-filters?scope=shared')
      .set('Authorization', `Bearer ${thirdToken}`);
    expect(res.status).toBe(200);
    expect(res.body.filters.map((f: { id: string }) => f.id)).toEqual([created.body.id]);
  });
});

describe('SavedFilter favorite + use tracking', () => {
  it('POST /:id/favorite - owner can favorite their filter', async () => {
    const created = await createFilter(ownerToken);
    const res = await request
      .post(`/api/saved-filters/${created.body.id}/favorite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: true });
    expect(res.status).toBe(200);
    expect(res.body.isFavorite).toBe(true);
  });

  it('POST /:id/favorite - non-owner (400 — per-user favorites out of scope)', async () => {
    const created = await createFilter(ownerToken, {
      name: 'S', jql: 'x = 1', visibility: 'PUBLIC',
    });
    const res = await request
      .post(`/api/saved-filters/${created.body.id}/favorite`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ value: true });
    expect(res.status).toBe(400);
  });

  it('POST /:id/use - increments useCount atomically', async () => {
    const created = await createFilter(ownerToken);
    await request
      .post(`/api/saved-filters/${created.body.id}/use`)
      .set('Authorization', `Bearer ${ownerToken}`);
    await request
      .post(`/api/saved-filters/${created.body.id}/use`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const after = await request
      .get(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(after.body.useCount).toBe(2);
    expect(after.body.lastUsedAt).not.toBeNull();
  });

  it('GET /?scope=favorite - returns only favorited filters sorted by useCount', async () => {
    const a = await createFilter(ownerToken, { name: 'A', jql: 'x = 1' });
    const b = await createFilter(ownerToken, { name: 'B', jql: 'x = 2' });
    const c = await createFilter(ownerToken, { name: 'C', jql: 'x = 3' });

    await request.post(`/api/saved-filters/${a.body.id}/favorite`).set('Authorization', `Bearer ${ownerToken}`).send({ value: true });
    await request.post(`/api/saved-filters/${c.body.id}/favorite`).set('Authorization', `Bearer ${ownerToken}`).send({ value: true });
    // Bump useCount on C so it ranks first.
    for (let i = 0; i < 3; i++) {
      await request.post(`/api/saved-filters/${c.body.id}/use`).set('Authorization', `Bearer ${ownerToken}`);
    }
    await request.post(`/api/saved-filters/${a.body.id}/use`).set('Authorization', `Bearer ${ownerToken}`);

    const res = await request
      .get('/api/saved-filters?scope=favorite')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.filters.map((f: { name: string }) => f.name)).toEqual(['C', 'A']);
    expect(res.body.filters.every((f: { id: string }) => f.id !== b.body.id)).toBe(true);
  });
});

describe('SavedFilter audit log', () => {
  it('writes savedFilter.created / updated / deleted / shared rows', async () => {
    const created = await createFilter(ownerToken);

    await request
      .patch(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'New name' });

    await request
      .post(`/api/saved-filters/${created.body.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ users: [otherId] });

    await request
      .delete(`/api/saved-filters/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'savedFilter' },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'savedFilter.created',
      'savedFilter.updated',
      'savedFilter.shared',
      'savedFilter.deleted',
    ]);
  });
});

describe('User preferences', () => {
  it('GET /api/users/me/preferences - returns empty object for a new user', async () => {
    const res = await request.get('/api/users/me/preferences').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('PATCH /api/users/me/preferences - sets searchDefaults', async () => {
    const res = await request
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ searchDefaults: { columns: ['key', 'summary'], pageSize: 50 } });
    expect(res.status).toBe(200);
    expect(res.body.searchDefaults.columns).toEqual(['key', 'summary']);
    expect(res.body.searchDefaults.pageSize).toBe(50);
  });

  it('PATCH /api/users/me/preferences - partial update preserves sibling keys', async () => {
    await request
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ searchDefaults: { columns: ['key', 'summary'], pageSize: 50 } });
    const res = await request
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ searchDefaults: { pageSize: 25 } });
    expect(res.status).toBe(200);
    // Sibling key `columns` must survive a partial PATCH over its parent section.
    expect(res.body.searchDefaults.columns).toEqual(['key', 'summary']);
    expect(res.body.searchDefaults.pageSize).toBe(25);
  });

  it('PATCH /api/users/me/preferences - 400 on columns above max (51)', async () => {
    const columns = Array.from({ length: 51 }, (_, i) => `c${i}`);
    const res = await request
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ searchDefaults: { columns } });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/users/me/preferences - 400 on empty body', async () => {
    const res = await request
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('PATCH /api/users/me/preferences - 401 without auth', async () => {
    const res = await request
      .patch('/api/users/me/preferences')
      .send({ searchDefaults: { pageSize: 50 } });
    expect(res.status).toBe(401);
  });
});
