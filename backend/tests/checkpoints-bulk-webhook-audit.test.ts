/**
 * TTMP-160 PR-8 — integration tests for bulk-apply, webhook debounce, and audit page.
 *
 * Covers:
 *   - POST /api/admin/checkpoint-templates/:id/apply-bulk (FR-21 + SEC-5).
 *   - GET  /api/admin/checkpoint-audit + /csv (FR-23 + SEC-6).
 *   - Webhook debounce via `lastWebhookSentAt` (FR-17).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createTestUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let rmToken: string;
let plainToken: string;
let auditorToken: string;
let adminUserId: string;
let plainUserId: string;
let projectA: string;
let projectB: string;
let releaseA: string;
let releaseB: string;
let typeId: string;
let templateId: string;
let doneStatusId: string;
let todoStatusId: string;

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

const VALID_CRITERIA = [{ type: 'STATUS_IN', categories: ['DONE'] }];

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.checkpointViolationEvent.deleteMany();
  await prisma.releaseCheckpoint.deleteMany();
  await prisma.checkpointTemplateItem.deleteMany();
  await prisma.checkpointTemplate.deleteMany();
  await prisma.checkpointType.deleteMany();
  await prisma.issueCustomFieldValue.deleteMany();
  await prisma.issueLink.deleteMany();
  await prisma.releaseItem.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.release.deleteMany();
  await prisma.userProjectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const adminRes = await createTestUser('admin@pr8.test', 'Password123', 'Admin');
  await grantSystemRole(adminRes.user.id, 'ADMIN');
  adminToken = await loginAs('admin@pr8.test');
  adminUserId = adminRes.user.id;

  const rmRes = await createTestUser('rm@pr8.test', 'Password123', 'RM');
  await grantSystemRole(rmRes.user.id, 'RELEASE_MANAGER');
  rmToken = await loginAs('rm@pr8.test');

  const auditorRes = await createTestUser('auditor@pr8.test', 'Password123', 'Auditor');
  await grantSystemRole(auditorRes.user.id, 'AUDITOR');
  auditorToken = await loginAs('auditor@pr8.test');

  const plainRes = await createTestUser('plain@pr8.test', 'Password123', 'Plain');
  plainToken = plainRes.accessToken;
  plainUserId = plainRes.user.id;

  // Two projects with plannedDate releases.
  const pa = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Project A', key: 'PRA' });
  projectA = pa.body.id;

  const pb = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Project B', key: 'PRB' });
  projectB = pb.body.id;

  // `plain` is a member of Project A only.
  await prisma.userProjectRole.create({
    data: { userId: plainUserId, projectId: projectA, role: 'USER' },
  });

  const ra = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0', projectId: projectA, plannedDate: '2026-06-01' });
  releaseA = ra.body.id;

  const rb = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0', projectId: projectB, plannedDate: '2026-06-01' });
  releaseB = rb.body.id;

  // Checkpoint type + template referencing it.
  const typeRes = await request
    .post('/api/admin/checkpoint-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'freeze',
      color: '#888888',
      weight: 'HIGH',
      offsetDays: -3,
      criteria: VALID_CRITERIA,
    });
  typeId = typeRes.body.id;

  const tmplRes = await request
    .post('/api/admin/checkpoint-templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Standard', items: [{ checkpointTypeId: typeId, orderIndex: 0 }] });
  templateId = tmplRes.body.id;

  // Workflow statuses.
  const statuses = await prisma.workflowStatus.findMany({
    where: { category: { in: ['DONE', 'TODO'] } },
    select: { id: true, category: true },
  });
  doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
  todoStatusId = statuses.find((s) => s.category === 'TODO')!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ============================================================
// FR-21 / SEC-5: bulk-apply
// ============================================================

describe('POST /api/admin/checkpoint-templates/:id/apply-bulk', () => {
  it('ADMIN applies template to multiple releases — 200 when all succeed', async () => {
    const res = await request
      .post(`/api/admin/checkpoint-templates/${templateId}/apply-bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ releaseIds: [releaseA, releaseB] });
    expect(res.status).toBe(200);
    expect(res.body.successful).toHaveLength(2);
    expect(res.body.forbidden).toHaveLength(0);
    expect(res.body.failed).toHaveLength(0);

    // Checkpoint rows actually created on each release.
    const created = await prisma.releaseCheckpoint.count({ where: { checkpointTypeId: typeId } });
    expect(created).toBe(2);
  });

  it('RELEASE_MANAGER bypasses per-project permission check (global role)', async () => {
    const res = await request
      .post(`/api/admin/checkpoint-templates/${templateId}/apply-bulk`)
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ releaseIds: [releaseA, releaseB] });
    expect(res.status).toBe(200);
    expect(res.body.successful).toHaveLength(2);
  });

  it('plain USER is blocked at router level (403) — endpoint requires SUPER_ADMIN / ADMIN / RELEASE_MANAGER', async () => {
    // Spec FR-21: "только для RELEASE_MANAGER / ADMIN". The per-release permission check
    // from SEC-5 only surfaces once the caller passes the outer system-role gate.
    const res = await request
      .post(`/api/admin/checkpoint-templates/${templateId}/apply-bulk`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ releaseIds: [releaseA, releaseB] });
    expect(res.status).toBe(403);

    const created = await prisma.releaseCheckpoint.count({ where: { checkpointTypeId: typeId } });
    expect(created).toBe(0);
  });

  it('marks non-existent releaseIds as forbidden', async () => {
    const res = await request
      .post(`/api/admin/checkpoint-templates/${templateId}/apply-bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        releaseIds: [releaseA, '00000000-0000-0000-0000-000000000000'],
      });
    expect(res.status).toBe(207);
    expect(res.body.successful.map((s: { releaseId: string }) => s.releaseId)).toContain(releaseA);
    expect(res.body.forbidden[0].reason).toBe('RELEASE_NOT_FOUND');
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request
      .post(`/api/admin/checkpoint-templates/${templateId}/apply-bulk`)
      .send({ releaseIds: [releaseA] });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// FR-23 / SEC-6: audit page
// ============================================================

describe('GET /api/admin/checkpoint-audit', () => {
  it('AUDITOR can list violation events', async () => {
    // Create an issue that will violate, apply the type, recompute.
    const issue = await prisma.issue.create({
      data: {
        projectId: projectA,
        number: 1,
        title: 'A-1',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
      },
    });
    await prisma.releaseItem.create({
      data: { releaseId: releaseA, issueId: issue.id, addedById: adminUserId },
    });
    await request
      .post(`/api/releases/${releaseA}/checkpoints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ checkpointTypeIds: [typeId] });

    const res = await request
      .get('/api/admin/checkpoint-audit')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // At least one violation event was opened by the recompute inside addCheckpoints.
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const first = res.body[0];
    expect(first.projectKey).toBe('PRA');
    expect(first.checkpointName).toBe('freeze');
    expect(first.issueKey).toBe('PRA-1');
  });

  it('plain USER gets 403 on audit list (SEC-6)', async () => {
    const res = await request
      .get('/api/admin/checkpoint-audit')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });

  it('onlyOpen=true filters out resolved events', async () => {
    const issue = await prisma.issue.create({
      data: {
        projectId: projectA,
        number: 1,
        title: 'A-1',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
      },
    });
    await prisma.releaseItem.create({
      data: { releaseId: releaseA, issueId: issue.id, addedById: adminUserId },
    });
    await request
      .post(`/api/releases/${releaseA}/checkpoints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ checkpointTypeIds: [typeId] });

    // Resolve the issue by switching to DONE and recomputing.
    await prisma.issue.update({ where: { id: issue.id }, data: { workflowStatusId: doneStatusId } });
    await request
      .post(`/api/releases/${releaseA}/checkpoints/recompute`)
      .set('Authorization', `Bearer ${adminToken}`);

    const openOnly = await request
      .get('/api/admin/checkpoint-audit?onlyOpen=true')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(openOnly.status).toBe(200);
    expect(openOnly.body).toEqual([]);

    // Without the filter, the (now-resolved) event is still listed.
    const all = await request
      .get('/api/admin/checkpoint-audit')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(all.body.length).toBeGreaterThanOrEqual(1);
    expect(all.body[0].resolvedAt).not.toBeNull();
  });

  it('projectId filter restricts events to that project', async () => {
    // Violations in Project A only.
    const issue = await prisma.issue.create({
      data: {
        projectId: projectA,
        number: 1,
        title: 'A-1',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
      },
    });
    await prisma.releaseItem.create({
      data: { releaseId: releaseA, issueId: issue.id, addedById: adminUserId },
    });
    await request
      .post(`/api/releases/${releaseA}/checkpoints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ checkpointTypeIds: [typeId] });

    const resA = await request
      .get(`/api/admin/checkpoint-audit?projectId=${projectA}`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.length).toBeGreaterThanOrEqual(1);

    const resB = await request
      .get(`/api/admin/checkpoint-audit?projectId=${projectB}`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(resB.body).toEqual([]);
  });
});

describe('GET /api/admin/checkpoint-audit/csv', () => {
  it('returns text/csv with the expected headers and row', async () => {
    const issue = await prisma.issue.create({
      data: {
        projectId: projectA,
        number: 1,
        title: 'A-1',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
      },
    });
    await prisma.releaseItem.create({
      data: { releaseId: releaseA, issueId: issue.id, addedById: adminUserId },
    });
    await request
      .post(`/api/releases/${releaseA}/checkpoints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ checkpointTypeIds: [typeId] });

    const res = await request
      .get('/api/admin/checkpoint-audit/csv')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const text = res.text;
    // BOM prefix + RFC 4180 CRLF
    expect(text.startsWith('\uFEFF')).toBe(true);
    const bodyAfterBom = text.slice(1);
    expect(bodyAfterBom.split('\r\n')[0]).toBe(
      'event_id,occurred_at,resolved_at,project_key,release_name,checkpoint_name,issue_key,criterion_type,reason',
    );
    expect(text).toContain('PRA');
    expect(text).toContain('freeze');
    expect(text).toContain('PRA-1');
  });
});

// ============================================================
// FR-17: webhook debounce (unit-style, stubs fetch)
// ============================================================

describe('FR-17 webhook debounce', () => {
  it('does not re-send a webhook within minStableSeconds of the last one', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    );
    try {
      // Build a type with a webhook URL and a small debounce.
      const t = await request
        .post('/api/admin/checkpoint-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'freeze-webhook',
          color: '#888888',
          weight: 'CRITICAL',
          offsetDays: -100, // deadline in the past → will immediately be VIOLATED on apply
          criteria: VALID_CRITERIA,
          webhookUrl: 'https://example.test/hook',
          minStableSeconds: 3600,
        });
      const issue = await prisma.issue.create({
        data: {
          projectId: projectA,
          number: 2,
          title: 'A-2',
          creatorId: adminUserId,
          workflowStatusId: todoStatusId,
        },
      });
      await prisma.releaseItem.create({
        data: { releaseId: releaseA, issueId: issue.id, addedById: adminUserId },
      });
      // Apply — new ReleaseCheckpoint starts with `state @default(PENDING)`, then the
      // post-deadline recompute (offsetDays=-100 → deadline far in the past) flips it to
      // VIOLATED. Webhook fires on PENDING→VIOLATED transition.
      await request
        .post(`/api/releases/${releaseA}/checkpoints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ checkpointTypeIds: [t.body.id] });

      // Give the detached `void notifyViolation(...)` a microtask tick to settle.
      await new Promise((r) => setTimeout(r, 50));
      const firstCallCount = fetchMock.mock.calls.length;
      expect(firstCallCount).toBeGreaterThanOrEqual(1);

      // Toggle state back and forth to simulate flapping. Because the type has a 3600s
      // debounce, no extra webhook should fire.
      await prisma.issue.update({ where: { id: issue.id }, data: { workflowStatusId: doneStatusId } });
      await request
        .post(`/api/releases/${releaseA}/checkpoints/recompute`)
        .set('Authorization', `Bearer ${adminToken}`);
      await prisma.issue.update({ where: { id: issue.id }, data: { workflowStatusId: todoStatusId } });
      await request
        .post(`/api/releases/${releaseA}/checkpoints/recompute`)
        .set('Authorization', `Bearer ${adminToken}`);

      await new Promise((r) => setTimeout(r, 50));
      // Only the initial webhook fired; debounce suppressed the second.
      expect(fetchMock.mock.calls.length).toBe(firstCallCount);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
