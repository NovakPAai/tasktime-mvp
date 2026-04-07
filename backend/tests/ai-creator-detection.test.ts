import { describe, it, expect, beforeEach } from 'vitest';
import { request, createAdminUser, createTestUser } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let adminToken: string;
let userToken: string;
let projectId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const user = await createTestUser('user@test.com', 'Password123', 'Regular User');
  userToken = user.accessToken;

  const proj = await request.post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Project', key: 'TST' });
  projectId = proj.body.id;
});

describe('AI Creator Detection — aiEligible / aiAssigneeType / aiExecutionStatus', () => {

  // 1. Default values on issue creation
  it('new issue has default AI fields: aiEligible=false, aiAssigneeType=HUMAN, aiExecutionStatus=NOT_STARTED', async () => {
    const res = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Human task', type: 'TASK' });

    expect(res.status).toBe(201);

    // Fetch full issue detail to check AI fields
    const detail = await request.get(`/api/issues/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detail.status).toBe(200);
    expect(detail.body.aiEligible).toBe(false);
    expect(detail.body.aiAssigneeType).toBe('HUMAN');
    expect(detail.body.aiExecutionStatus).toBe('NOT_STARTED');
  });

  // 2. PATCH /issues/:id/ai-flags — update aiEligible and aiAssigneeType
  it('PATCH /api/issues/:id/ai-flags — admin can set aiEligible=true and aiAssigneeType=AGENT', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Agent task', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true, aiAssigneeType: 'AGENT' });

    expect(res.status).toBe(200);
    expect(res.body.aiEligible).toBe(true);
    expect(res.body.aiAssigneeType).toBe('AGENT');
  });

  it('PATCH /api/issues/:id/ai-flags — can set aiAssigneeType=MIXED', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Mixed task', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true, aiAssigneeType: 'MIXED' });

    expect(res.status).toBe(200);
    expect(res.body.aiAssigneeType).toBe('MIXED');
  });

  it('PATCH /api/issues/:id/ai-flags — can toggle aiEligible back to false', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Toggle task', type: 'TASK' });

    // Set to agent
    await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true, aiAssigneeType: 'AGENT' });

    // Toggle back to human
    const res = await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: false, aiAssigneeType: 'HUMAN' });

    expect(res.status).toBe(200);
    expect(res.body.aiEligible).toBe(false);
    expect(res.body.aiAssigneeType).toBe('HUMAN');
  });

  // 3. RBAC: regular USER cannot update AI flags
  it('PATCH /api/issues/:id/ai-flags — regular user gets 403', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'RBAC test', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ aiEligible: true });

    expect(res.status).toBe(403);
  });

  // 4. PATCH /issues/:id/ai-status — update aiExecutionStatus
  it('PATCH /api/issues/:id/ai-status — admin can set aiExecutionStatus=IN_PROGRESS', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Status test', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiExecutionStatus: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.aiExecutionStatus).toBe('IN_PROGRESS');
  });

  it('PATCH /api/issues/:id/ai-status — full lifecycle NOT_STARTED -> IN_PROGRESS -> DONE', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Lifecycle test', type: 'TASK' });

    // Mark as agent-eligible
    await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true, aiAssigneeType: 'AGENT' });

    // IN_PROGRESS
    const r1 = await request.patch(`/api/issues/${issue.body.id}/ai-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiExecutionStatus: 'IN_PROGRESS' });
    expect(r1.body.aiExecutionStatus).toBe('IN_PROGRESS');

    // DONE
    const r2 = await request.patch(`/api/issues/${issue.body.id}/ai-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiExecutionStatus: 'DONE' });
    expect(r2.body.aiExecutionStatus).toBe('DONE');
  });

  it('PATCH /api/issues/:id/ai-status — can set FAILED', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Fail test', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiExecutionStatus: 'FAILED' });

    expect(res.status).toBe(200);
    expect(res.body.aiExecutionStatus).toBe('FAILED');
  });

  // 5. RBAC: regular USER cannot update AI status
  it('PATCH /api/issues/:id/ai-status — regular user gets 403', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'RBAC status test', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ aiExecutionStatus: 'DONE' });

    expect(res.status).toBe(403);
  });

  // 6. Validation: invalid aiAssigneeType
  it('PATCH /api/issues/:id/ai-flags — rejects invalid aiAssigneeType', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Validation test', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiAssigneeType: 'ROBOT' });

    expect(res.status).toBe(400);
  });

  // 7. Validation: invalid aiExecutionStatus
  it('PATCH /api/issues/:id/ai-status — rejects invalid aiExecutionStatus', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Validation test 2', type: 'TASK' });

    const res = await request.patch(`/api/issues/${issue.body.id}/ai-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiExecutionStatus: 'RUNNING' });

    expect(res.status).toBe(400);
  });

  // 8. 404 for non-existent issue
  it('PATCH /api/issues/:id/ai-flags — 404 for non-existent issue', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.patch(`/api/issues/${fakeId}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true });

    expect(res.status).toBe(404);
  });

  it('PATCH /api/issues/:id/ai-status — 404 for non-existent issue', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.patch(`/api/issues/${fakeId}/ai-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiExecutionStatus: 'DONE' });

    expect(res.status).toBe(404);
  });

  // 9. AI flags are visible in issue list
  it('GET /api/projects/:projectId/issues — includes AI fields in list response', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Listed task', type: 'TASK' });

    await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true, aiAssigneeType: 'AGENT' });

    const list = await request.get(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(list.status).toBe(200);
    const found = list.body.data.find((i: any) => i.id === issue.body.id);
    expect(found).toBeTruthy();
    expect(found.aiEligible).toBe(true);
    expect(found.aiAssigneeType).toBe('AGENT');
  });

  // 10. Audit log is created for AI flag changes
  it('PATCH /api/issues/:id/ai-flags — creates audit log entry', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Audit test', type: 'TASK' });

    await request.patch(`/api/issues/${issue.body.id}/ai-flags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiEligible: true, aiAssigneeType: 'AGENT' });

    const history = await request.get(`/api/issues/${issue.body.id}/history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(history.status).toBe(200);
    const aiEntry = history.body.find((h: any) => h.action === 'issue.ai_flags_updated');
    expect(aiEntry).toBeTruthy();
    expect(aiEntry.details).toMatchObject({ aiEligible: true, aiAssigneeType: 'AGENT' });
  });

  // 11. creator field is populated
  it('issue.creator shows who created the issue', async () => {
    const issue = await request.post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Creator test', type: 'TASK' });

    expect(issue.status).toBe(201);
    expect(issue.body.creator).toBeTruthy();
    expect(issue.body.creator.name).toBe('Admin');

    const detail = await request.get(`/api/issues/${issue.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.creator.name).toBe('Admin');
  });
});
