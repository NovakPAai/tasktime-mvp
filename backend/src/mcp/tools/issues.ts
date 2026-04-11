import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { prisma, resolveKey, text, errText } from '../context.js';
import { api } from '../api-client.js';

export function registerIssueTools(server: McpServer) {
  // ── get_issue ────────────────────────────────────────────────────────────────
  server.tool(
    'get_issue',
    'Get a full issue card by key (e.g. TTMP-95) or UUID',
    { key: z.string().describe('Issue key like TTMP-95 or UUID') },
    async ({ key }) => {
      try {
        const resolved = await resolveKey(key);
        const issue = await prisma.issue.findUniqueOrThrow({
          where: { id: resolved.id },
          include: {
            assignee: { select: { name: true, email: true } },
            creator: { select: { name: true } },
            issueTypeConfig: { select: { name: true } },
            parent: { select: { title: true, number: true, issueTypeConfig: { select: { name: true } }, project: { select: { key: true } } } },
            children: {
              select: { title: true, status: true, number: true, issueTypeConfig: { select: { name: true } }, project: { select: { key: true } } },
              orderBy: { orderIndex: 'asc' },
              take: 30,
            },
            sprint: { select: { name: true, state: true, startDate: true, endDate: true } },
            release: { select: { name: true, state: true } },
            project: { select: { key: true, name: true } },
            _count: { select: { comments: true, timeLogs: true } },
          },
        });

        const parentStr = issue.parent
          ? `${issue.parent.project.key}-${issue.parent.number} [${issue.parent.issueTypeConfig?.name ?? '?'}] "${issue.parent.title}"`
          : 'none';

        const sprintStr = issue.sprint
          ? `${issue.sprint.name} [${issue.sprint.state}]${issue.sprint.endDate ? ` ends ${issue.sprint.endDate.toISOString().slice(0, 10)}` : ''}`
          : 'none';

        const childrenStr = issue.children.length > 0
          ? issue.children.map(c => `  • ${c.project.key}-${c.number} [${c.issueTypeConfig?.name ?? '?'}] [${c.status}] ${c.title}`).join('\n')
          : '  none';

        const lines = [
          `${resolved.key} [${issue.issueTypeConfig?.name ?? '?'}] [${issue.status}] [${issue.priority}]`,
          `Title: ${issue.title}`,
          ``,
          `Sprint:   ${sprintStr}`,
          `Release:  ${issue.release?.name ?? 'none'} ${issue.release ? `[${issue.release.state}]` : ''}`,
          `Assignee: ${issue.assignee?.name ?? 'unassigned'}`,
          `Creator:  ${issue.creator.name}`,
          `Parent:   ${parentStr}`,
          ``,
          `Children (${issue.children.length}):`,
          childrenStr,
          ``,
          issue.description ? `Description:\n${issue.description}` : `Description: (empty)`,
          ``,
          `EstimatedHours: ${issue.estimatedHours ?? 'not set'}`,
          `AI: eligible=${issue.aiEligible}, status=${issue.aiExecutionStatus}, type=${issue.aiAssigneeType}`,
          `Comments: ${issue._count.comments} | TimeLogs: ${issue._count.timeLogs}`,
          `Created: ${issue.createdAt.toISOString().slice(0, 10)}`,
        ];

        return text(lines.join('\n'));
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── list_issues ───────────────────────────────────────────────────────────────
  server.tool(
    'list_issues',
    'List issues with filters. Use sprint="active" for current sprint.',
    {
      project: z.string().describe('Project key, e.g. TTMP'),
      sprint: z.string().optional().describe('"active" or sprint UUID or "backlog"'),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']).optional(),
      aiEligible: z.boolean().optional().describe('Only AI-eligible issues'),
      assigneeType: z.enum(['HUMAN', 'AGENT', 'MIXED']).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ project, sprint, status, aiEligible, assigneeType, limit }) => {
      try {
        const proj = await prisma.project.findUnique({ where: { key: project.toUpperCase() } });
        if (!proj) return errText(`Project ${project} not found`);

        let sprintId: string | null | undefined;
        if (sprint === 'active') {
          const activeSprint = await prisma.sprint.findFirst({ where: { projectId: proj.id, state: 'ACTIVE' } });
          sprintId = activeSprint?.id ?? undefined;
        } else if (sprint === 'backlog') {
          sprintId = null;
        } else if (sprint) {
          sprintId = sprint;
        }

        const where: Record<string, unknown> = { projectId: proj.id };
        if (status) where.status = status;
        if (aiEligible !== undefined) where.aiEligible = aiEligible;
        if (assigneeType) where.aiAssigneeType = assigneeType;
        if (sprintId !== undefined) where.sprintId = sprintId;

        const issues = await prisma.issue.findMany({
          where,
          include: {
            assignee: { select: { name: true } },
            sprint: { select: { name: true } },
            issueTypeConfig: { select: { name: true } },
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          take: limit,
        });

        if (issues.length === 0) return text('No issues found matching the filters.');

        const header = `Found ${issues.length} issue(s) in ${project}:\n`;
        const rows = issues.map(i =>
          `${project.toUpperCase()}-${i.number} [${i.issueTypeConfig?.name ?? '?'}] [${i.status}] [${i.priority}] ${i.title.slice(0, 60)}${i.title.length > 60 ? '…' : ''} | ${i.assignee?.name ?? 'unassigned'}${i.aiEligible ? ' | AI✓' : ''}`,
        );

        return text(header + rows.join('\n'));
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── update_status ─────────────────────────────────────────────────────────────
  server.tool(
    'update_status',
    'Change the status of an issue (routes through the workflow engine)',
    {
      key: z.string().describe('Issue key, e.g. TTMP-95'),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']),
    },
    async ({ key, status }) => {
      try {
        const resolved = await resolveKey(key);
        const old = resolved.status;

        // Route through backend API so the workflow engine, validators,
        // and post-functions execute (e.g. required fields check before DONE).
        await api.patch(`/api/issues/${resolved.id}/status`, { status });

        return text(`${resolved.key}: ${old} → ${status} ✓`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── create_issue ──────────────────────────────────────────────────────────────
  server.tool(
    'create_issue',
    'Create an issue of any type (EPIC, STORY, TASK, BUG, SUBTASK) in a project',
    {
      project: z.string().describe('Project key, e.g. TTMP'),
      title: z.string().min(1).max(500),
      type: z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK']).default('TASK'),
      description: z.string().optional(),
      priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
      parentKey: z.string().optional().describe('Parent issue key (required for SUBTASK, optional for STORY/TASK/BUG under EPIC)'),
    },
    async ({ project, title, type, description, priority, parentKey }) => {
      try {
        if (type === 'SUBTASK' && !parentKey) {
          return errText('parentKey is required for SUBTASK');
        }

        const proj = await prisma.project.findUnique({ where: { key: project.toUpperCase() } });
        if (!proj) return errText(`Project ${project} not found`);

        let parentId: string | undefined;
        if (parentKey) {
          const parent = await resolveKey(parentKey);
          if (parent.projectId !== proj.id) {
            return errText(`Parent issue ${parentKey} belongs to project ${parent.projectKey}, not ${project.toUpperCase()}`);
          }
          parentId = parent.id;
        }

        const issue = await api.post<{ number: number; project: { key: string } }>(
          `/api/projects/${proj.id}/issues`,
          { title, description, type, priority, parentId },
        );

        const issueKey = `${issue.project.key}-${issue.number}`;
        const parentStr = parentKey ? ` → ${parentKey}` : '';
        return text(`Created ${issueKey}: "${title}" (${type}${parentStr}) ✓`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── create_subtask ────────────────────────────────────────────────────────────
  server.tool(
    'create_subtask',
    'Create a subtask under a parent issue (real decomposition)',
    {
      parentKey: z.string().describe('Parent issue key, e.g. TTMP-95'),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
    },
    async ({ parentKey, title, description, priority }) => {
      try {
        const parent = await resolveKey(parentKey);

        // Route through API so RBAC, hierarchy validation, and numbering
        // are handled by the service layer.
        const child = await api.post<{ number: number; project: { key: string } }>(
          `/api/projects/${parent.projectId}/issues`,
          {
            title,
            description,
            type: 'SUBTASK',
            priority,
            parentId: parent.id,
          },
        );

        const childKey = `${child.project.key}-${child.number}`;
        return text(`Created ${childKey}: "${title}" (SUBTASK → ${parentKey}) ✓`);
      } catch (err) {
        return errText(err);
      }
    },
  );
}
