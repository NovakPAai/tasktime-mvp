import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { request, createAdminUser, createManagerUser } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let managerToken: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const manager = await createManagerUser();
  managerToken = manager.accessToken;
});

describe('E2E main flows', () => {
  it('ADMIN + MANAGER can go through main project lifecycle', async () => {
    // Manager creates project
    const projectRes = await request
      .post('/api/projects')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'E2E Project', key: 'E2E' });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.id as string;

    // Admin creates a team and adds manager to it
    const teamRes = await request
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Team' });
    expect(teamRes.status).toBe(201);
    const teamId = teamRes.body.id as string;

    const managerUser = await prisma.user.findFirstOrThrow({ where: { email: 'manager@test.com' } });

    const membersRes = await request
      .put(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [managerUser.id] });
    expect(membersRes.status).toBe(200);

    // Manager creates issues (backlog)
    const epicRes = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'E2E Epic', type: 'EPIC' });
    expect(epicRes.status).toBe(201);

    const taskRes = await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'E2E Task', type: 'TASK', parentId: epicRes.body.id });
    expect(taskRes.status).toBe(201);
    const issueId = taskRes.body.id as string;

    // Manager creates sprint and moves issue into sprint
    const sprintRes = await request
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'E2E Sprint' });
    expect(sprintRes.status).toBe(201);
    const sprintId = sprintRes.body.id as string;

    const moveRes = await request
      .post(`/api/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ issueIds: [issueId] });
    expect(moveRes.status).toBe(200);

    // Manager starts sprint
    const startRes = await request
      .post(`/api/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(startRes.status).toBe(200);

    // Manager works on issue: status → time tracking → comment
    const statusRes = await request
      .patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(statusRes.status).toBe(200);

    const timeStart = await request
      .post(`/api/issues/${issueId}/time/start`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(timeStart.status).toBe(201);

    const timeStop = await request
      .post(`/api/issues/${issueId}/time/stop`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(timeStop.status).toBe(200);

    const manualTime = await request
      .post(`/api/issues/${issueId}/time`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ hours: 2.0, note: 'E2E work log' });
    expect(manualTime.status).toBe(201);

    const commentRes = await request
      .post(`/api/issues/${issueId}/comments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ body: 'E2E comment' });
    expect(commentRes.status).toBe(201);

    // Manager finishes work and closes sprint
    const statusDoneRes = await request
      .patch(`/api/issues/${issueId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'DONE' });
    expect(statusDoneRes.status).toBe(200);

    const closeRes = await request
      .post(`/api/sprints/${sprintId}/close`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(closeRes.status).toBe(200);

    // Admin checks project dashboard and admin stats / reports
    const dashboardRes = await request
      .get(`/api/projects/${projectId}/dashboard`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.totals.totalIssues).toBeGreaterThan(0);

    const statsRes = await request
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.counts).toBeDefined();

    const reportRes = await request
      .get('/api/admin/reports/issues-by-status')
      .query({ projectId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reportRes.status).toBe(200);
    expect(Array.isArray(reportRes.body)).toBe(true);
  });
});

