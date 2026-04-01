import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { prisma, resolveKey, getAgentUserId, text, errText } from '../context.js';

export function registerAgentTools(server: McpServer) {
  // ── get_eligible_issues ───────────────────────────────────────────────────────
  server.tool(
    'get_eligible_issues',
    'Get the queue of AI-eligible issues not yet started (for autonomous agent)',
    {
      project: z.string().optional().describe('Project key to filter by, e.g. TTMP. Omit for all projects.'),
      limit: z.number().int().min(1).max(50).default(20),
    },
    async ({ project, limit }) => {
      try {
        let projectId: string | undefined;
        if (project) {
          const proj = await prisma.project.findUnique({ where: { key: project.toUpperCase() } });
          if (!proj) return errText(`Project ${project} not found`);
          projectId = proj.id;
        }

        const issues = await prisma.issue.findMany({
          where: {
            aiEligible: true,
            aiExecutionStatus: 'NOT_STARTED',
            status: { notIn: ['DONE', 'CANCELLED'] },
            ...(projectId ? { projectId } : {}),
          },
          include: {
            project: { select: { key: true } },
            sprint: { select: { name: true, state: true } },
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          take: limit,
        });

        if (issues.length === 0) {
          return text('No AI-eligible issues with NOT_STARTED status found.');
        }

        const rows = issues.map(i =>
          `${i.project.key}-${i.number} [${i.type}] [${i.priority}] [${i.status}] ${i.title.slice(0, 60)}${i.sprint ? ` | sprint: ${i.sprint.name}` : ' | backlog'}`,
        );
        return text(`Eligible issues (${issues.length}):\n${rows.join('\n')}\n\nUse claim_issue(key) to take one.`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── claim_issue ───────────────────────────────────────────────────────────────
  server.tool(
    'claim_issue',
    'Atomically claim an AI-eligible issue for the agent (sets IN_PROGRESS + AGENT)',
    { key: z.string().describe('Issue key, e.g. TTMP-95') },
    async ({ key }) => {
      try {
        const issue = await resolveKey(key);
        const agentUserId = await getAgentUserId();

        const current = await prisma.issue.findUniqueOrThrow({
          where: { id: issue.id },
          select: { aiEligible: true, aiExecutionStatus: true },
        });

        if (!current.aiEligible) {
          return errText(`${key} is not marked as AI-eligible. Set aiEligible=true first.`);
        }
        if (current.aiExecutionStatus === 'IN_PROGRESS') {
          return errText(`${key} is already claimed (aiExecutionStatus=IN_PROGRESS).`);
        }
        if (current.aiExecutionStatus === 'DONE') {
          return errText(`${key} is already done.`);
        }

        await prisma.$transaction([
          prisma.issue.update({
            where: { id: issue.id },
            data: {
              aiExecutionStatus: 'IN_PROGRESS',
              aiAssigneeType: 'AGENT',
              status: 'IN_PROGRESS',
              assigneeId: agentUserId,
            },
          }),
          prisma.auditLog.create({
            data: {
              action: 'UPDATE',
              entityType: 'Issue',
              entityId: issue.id,
              userId: agentUserId,
              details: { event: 'agent_claimed', key },
            },
          }),
        ]);

        return text(`${key} claimed by agent ✓\nStatus: IN_PROGRESS | aiExecutionStatus: IN_PROGRESS\nNext: get_issue("${key}") to read the full spec.`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── complete_issue ────────────────────────────────────────────────────────────
  server.tool(
    'complete_issue',
    'Mark agent work as done. Sets status=REVIEW (awaiting human approval) + adds summary comment.',
    {
      key: z.string().describe('Issue key, e.g. TTMP-95'),
      summary: z.string().min(1).max(5000).describe('What was done — becomes a comment on the issue'),
    },
    async ({ key, summary }) => {
      try {
        const issue = await resolveKey(key);
        const agentUserId = await getAgentUserId();

        await prisma.$transaction([
          prisma.issue.update({
            where: { id: issue.id },
            data: {
              aiExecutionStatus: 'DONE',
              status: 'REVIEW',
            },
          }),
          prisma.comment.create({
            data: {
              issueId: issue.id,
              authorId: agentUserId,
              body: `🤖 Agent completed work:\n\n${summary}`,
            },
          }),
          prisma.auditLog.create({
            data: {
              action: 'UPDATE',
              entityType: 'Issue',
              entityId: issue.id,
              userId: agentUserId,
              details: { event: 'agent_completed', key },
            },
          }),
        ]);

        return text(`${key}: IN_PROGRESS → REVIEW ✓\nSummary comment added.\nAwaiting human review before DONE.`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── fail_issue ────────────────────────────────────────────────────────────────
  server.tool(
    'fail_issue',
    'Escalate: agent could not complete the issue. Resets to OPEN for human.',
    {
      key: z.string().describe('Issue key, e.g. TTMP-95'),
      reason: z.string().min(1).max(3000).describe('Why the agent failed — becomes an escalation comment'),
    },
    async ({ key, reason }) => {
      try {
        const issue = await resolveKey(key);
        const agentUserId = await getAgentUserId();

        await prisma.$transaction([
          prisma.issue.update({
            where: { id: issue.id },
            data: {
              aiExecutionStatus: 'FAILED',
              status: 'OPEN',
              aiAssigneeType: 'HUMAN',
              assigneeId: null,
            },
          }),
          prisma.comment.create({
            data: {
              issueId: issue.id,
              authorId: agentUserId,
              body: `⚠️ Agent escalation — could not complete:\n\n${reason}\n\nRequires manual intervention.`,
            },
          }),
          prisma.auditLog.create({
            data: {
              action: 'UPDATE',
              entityType: 'Issue',
              entityId: issue.id,
              userId: agentUserId,
              details: { event: 'agent_failed', key, reason: reason.slice(0, 200) },
            },
          }),
        ]);

        return text(`${key}: FAILED | Returned to OPEN for human ✓\nEscalation comment added.`);
      } catch (err) {
        return errText(err);
      }
    },
  );
}
