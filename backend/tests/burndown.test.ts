/**
 * TTMP-160 PR-10 — integration tests for burndown backend.
 *
 * Covers:
 *   - POST /backfill (ADMIN/SUPER_ADMIN only; RELEASE_MANAGER is 403) captures a snapshot.
 *   - Cron tick via runOnce('burndown-snapshot') writes one row per active release;
 *     second call for the same day is idempotent (upsert).
 *   - Retention (runOnce('burndown-retention')) removes old snapshots for DONE releases
 *     but keeps the newest one per release.
 *   - GET /burndown returns series + ideal line with correct start value for each metric.
 *   - Read-gate: plain USER without project membership → 403.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createTestUser } from './helpers.js';
import { runOnce } from '../src/modules/releases/checkpoints/checkpoint-scheduler.service.js';
import { captureSnapshot } from '../src/modules/releases/checkpoints/burndown.service.js';

const prisma = new PrismaClient();

let adminToken: string;
let plainToken: string;
let releaseManagerToken: string;
let adminUserId: string;
let plainUserId: string;
let projectId: string;
let releaseId: string;
let issueDoneId: string;
let issueOpenId: string;
let doneStatusId: string;
let todoStatusId: string;
let releaseStatusPlanningId: string;
let releaseStatusDoneId: string;

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
  await prisma.releaseBurndownSnapshot.deleteMany();
  await prisma.releaseCheckpoint.deleteMany();
  await prisma.checkpointTemplateItem.deleteMany();
  await prisma.checkpointTemplate.deleteMany();
  await prisma.checkpointType.deleteMany();
  await prisma.releaseItem.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.release.deleteMany();
  await prisma.userProjectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const adminRes = await createTestUser('admin@pr10.test', 'Password123', 'Admin');
  await grantSystemRole(adminRes.user.id, 'ADMIN');
  adminToken = await loginAs('admin@pr10.test');
  adminUserId = adminRes.user.id;

  const rmRes = await createTestUser('rm@pr10.test', 'Password123', 'RM');
  await grantSystemRole(rmRes.user.id, 'RELEASE_MANAGER');
  releaseManagerToken = await loginAs('rm@pr10.test');

  const plainRes = await createTestUser('plain@pr10.test', 'Password123', 'Plain');
  plainToken = plainRes.accessToken;
  plainUserId = plainRes.user.id;

  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'PR-10', key: 'PR10' });
  projectId = proj.body.id;

  const rel = await request
    .post('/api/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: '1.0', projectId, plannedDate: '2026-06-01' });
  releaseId = rel.body.id;

  // Lookups — ReleaseStatus categories are seeded by migration.
  const releaseStatuses = await prisma.releaseStatus.findMany({
    where: { category: { in: ['PLANNING', 'DONE'] } },
    select: { id: true, category: true },
  });
  releaseStatusPlanningId = releaseStatuses.find((s) => s.category === 'PLANNING')!.id;
  releaseStatusDoneId = releaseStatuses.find((s) => s.category === 'DONE')!.id;

  // Ensure release is PLANNING so the snapshot tick picks it up.
  await prisma.release.update({
    where: { id: releaseId },
    data: { statusId: releaseStatusPlanningId },
  });

  const statuses = await prisma.workflowStatus.findMany({
    where: { category: { in: ['DONE', 'TODO'] } },
    select: { id: true, category: true },
  });
  doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
  todoStatusId = statuses.find((s) => s.category === 'TODO')!.id;

  // Issue A: DONE status (counted as done), 4h estimated.
  issueDoneId = (
    await prisma.issue.create({
      data: {
        projectId,
        number: 1,
        title: 'Done task',
        creatorId: adminUserId,
        workflowStatusId: doneStatusId,
        status: 'DONE',
        estimatedHours: '4.00',
      },
    })
  ).id;

  // Issue B: OPEN status, 6h estimated.
  issueOpenId = (
    await prisma.issue.create({
      data: {
        projectId,
        number: 2,
        title: 'Open task',
        creatorId: adminUserId,
        workflowStatusId: todoStatusId,
        status: 'OPEN',
        estimatedHours: '6.00',
      },
    })
  ).id;

  await prisma.releaseItem.createMany({
    data: [
      { releaseId, issueId: issueDoneId, addedById: adminUserId },
      { releaseId, issueId: issueOpenId, addedById: adminUserId },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ============================================================
// Capture + backfill
// ============================================================

describe('POST /api/releases/:releaseId/burndown/backfill', () => {
  it('ADMIN creates snapshot with correct aggregates', async () => {
    const res = await request
      .post(`/api/releases/${releaseId}/burndown/backfill`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const snapshot = await prisma.releaseBurndownSnapshot.findFirst({
      where: { releaseId },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot!.totalIssues).toBe(2);
    expect(snapshot!.doneIssues).toBe(1);
    expect(snapshot!.openIssues).toBe(1);
    expect(Number(snapshot!.totalEstimatedHours)).toBe(10);
    expect(Number(snapshot!.doneEstimatedHours)).toBe(4);
    expect(Number(snapshot!.openEstimatedHours)).toBe(6);
  });

  it('RELEASE_MANAGER is rejected (SEC-8: only ADMIN/SUPER_ADMIN can rewrite history)', async () => {
    const res = await request
      .post(`/api/releases/${releaseId}/burndown/backfill`)
      .set('Authorization', `Bearer ${releaseManagerToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('plain USER without project membership → 403', async () => {
    const res = await request
      .post(`/api/releases/${releaseId}/burndown/backfill`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('explicit date param upserts for that day', async () => {
    const res1 = await request
      .post(`/api/releases/${releaseId}/burndown/backfill`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-05-01' });
    expect(res1.status).toBe(201);
    expect(res1.body.snapshotDate).toBe('2026-05-01');

    // Run twice with the same date — must remain a single row (upsert, not insert).
    const res2 = await request
      .post(`/api/releases/${releaseId}/burndown/backfill`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-05-01' });
    expect(res2.status).toBe(201);

    const rows = await prisma.releaseBurndownSnapshot.findMany({
      where: { releaseId, snapshotDate: new Date('2026-05-01T00:00:00.000Z') },
    });
    expect(rows).toHaveLength(1);
  });
});

// ============================================================
// Scheduler tick
// ============================================================

describe('burndown scheduler tick', () => {
  it('captures one row per active release and is idempotent per day', async () => {
    const first = await runOnce('burndown-snapshot');
    expect(first.skippedByLock).toBe(false);
    expect(first.processedReleases).toBe(1);

    const second = await runOnce('burndown-snapshot');
    expect(second.processedReleases).toBe(1);

    const rows = await prisma.releaseBurndownSnapshot.findMany({
      where: { releaseId },
    });
    // Same day → upsert → still one row.
    expect(rows).toHaveLength(1);
  });

  it('retention purge keeps the newest snapshot for a DONE release older than cutoff', async () => {
    // Seed 3 old snapshots on distinct days.
    await captureSnapshot(releaseId, new Date('2024-01-01T00:00:00.000Z'));
    await captureSnapshot(releaseId, new Date('2024-02-01T00:00:00.000Z'));
    await captureSnapshot(releaseId, new Date('2024-03-01T00:00:00.000Z'));

    // Flip release to DONE + old releaseDate so retention rule kicks in.
    await prisma.release.update({
      where: { id: releaseId },
      data: { statusId: releaseStatusDoneId, releaseDate: new Date('2024-03-02T00:00:00.000Z') },
    });

    const result = await runOnce('burndown-retention');
    expect(result.skippedByLock).toBe(false);
    expect(result.processedReleases).toBe(2); // deleted count

    const remaining = await prisma.releaseBurndownSnapshot.findMany({
      where: { releaseId },
      orderBy: { snapshotDate: 'desc' },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.snapshotDate.toISOString().slice(0, 10)).toBe('2024-03-01');
  });
});

// ============================================================
// GET /burndown
// ============================================================

describe('GET /api/releases/:releaseId/burndown', () => {
  beforeEach(async () => {
    // Two snapshots to give the series at least two points + a non-empty ideal line.
    await captureSnapshot(releaseId, new Date('2026-05-01T00:00:00.000Z'));
    // Flip one issue to DONE between snapshots so the second point is meaningfully different.
    await prisma.issue.update({
      where: { id: issueOpenId },
      data: { status: 'DONE' },
    });
    await captureSnapshot(releaseId, new Date('2026-05-10T00:00:00.000Z'));
  });

  it('returns series, initial, idealLine with ideal[0] = open issues', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/burndown`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.releaseId).toBe(releaseId);
    expect(res.body.metric).toBe('issues');
    expect(res.body.plannedDate).toBe('2026-06-01');
    expect(res.body.series).toHaveLength(2);
    expect(res.body.initial.date).toBe('2026-05-01');
    expect(res.body.initial.total).toBe(2);
    expect(res.body.initial.done).toBe(1);

    // Ideal line: starts at open=1 (initial.total − initial.done − initial.cancelled),
    // ends at 0 on plannedDate.
    expect(res.body.idealLine.length).toBeGreaterThan(1);
    expect(res.body.idealLine[0]).toEqual({ date: '2026-05-01', value: 1 });
    expect(res.body.idealLine[res.body.idealLine.length - 1]).toEqual({ date: '2026-06-01', value: 0 });
  });

  it('metric=hours uses initial open hours as the baseline', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/burndown?metric=hours`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.metric).toBe('hours');
    expect(res.body.idealLine[0]!.value).toBe(6);
  });

  it('plain USER without project membership → 403', async () => {
    const res = await request
      .get(`/api/releases/${releaseId}/burndown`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
  });

  it('USER with membership in the project CAN read burndown', async () => {
    await prisma.userProjectRole.create({
      data: { userId: plainUserId, projectId, role: 'USER' },
    });
    const token = await loginAs('plain@pr10.test');
    const res = await request
      .get(`/api/releases/${releaseId}/burndown`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
