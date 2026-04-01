import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { prisma, text, errText } from '../context.js';

export function registerSprintTools(server: McpServer) {
  // ── get_sprint_context ────────────────────────────────────────────────────────
  server.tool(
    'get_sprint_context',
    'Get the active (or latest planned) sprint with issue stats and AI summary',
    { project: z.string().describe('Project key, e.g. TTMP') },
    async ({ project }) => {
      try {
        const proj = await prisma.project.findUnique({ where: { key: project.toUpperCase() } });
        if (!proj) return errText(`Project ${project} not found`);

        const sprint = await prisma.sprint.findFirst({
          where: {
            projectId: proj.id,
            state: { in: ['ACTIVE', 'PLANNED'] },
          },
          orderBy: [{ state: 'desc' }, { startDate: 'desc' }],
          include: {
            issues: {
              select: {
                status: true,
                priority: true,
                aiEligible: true,
                aiExecutionStatus: true,
                aiAssigneeType: true,
                type: true,
                number: true,
                title: true,
                assignee: { select: { name: true } },
              },
            },
          },
        });

        if (!sprint) return text(`No active or planned sprint found for ${project}.`);

        const issues = sprint.issues;
        const byStatus = {
          OPEN: issues.filter(i => i.status === 'OPEN').length,
          IN_PROGRESS: issues.filter(i => i.status === 'IN_PROGRESS').length,
          REVIEW: issues.filter(i => i.status === 'REVIEW').length,
          DONE: issues.filter(i => i.status === 'DONE').length,
          CANCELLED: issues.filter(i => i.status === 'CANCELLED').length,
        };

        const aiEligible = issues.filter(i => i.aiEligible);
        const aiInProgress = aiEligible.filter(i => i.aiExecutionStatus === 'IN_PROGRESS');
        const aiNotStarted = aiEligible.filter(i => i.aiExecutionStatus === 'NOT_STARTED');

        const daysLeft = sprint.endDate
          ? Math.ceil((sprint.endDate.getTime() - Date.now()) / 86_400_000)
          : null;

        const lines = [
          `Sprint: ${sprint.name} [${sprint.state}]`,
          sprint.startDate && sprint.endDate
            ? `Period: ${sprint.startDate.toISOString().slice(0, 10)} — ${sprint.endDate.toISOString().slice(0, 10)}${daysLeft !== null ? ` (${daysLeft > 0 ? daysLeft + ' days left' : 'overdue'})` : ''}`
            : `Period: not set`,
          sprint.goal ? `Goal: ${sprint.goal}` : '',
          ``,
          `Issues: ${issues.length} total`,
          `  OPEN: ${byStatus.OPEN} | IN_PROGRESS: ${byStatus.IN_PROGRESS} | REVIEW: ${byStatus.REVIEW} | DONE: ${byStatus.DONE}`,
          ``,
          `AI-eligible: ${aiEligible.length}`,
          `  NOT_STARTED: ${aiNotStarted.length} | IN_PROGRESS: ${aiInProgress.length} | DONE: ${aiEligible.filter(i => i.aiExecutionStatus === 'DONE').length}`,
        ];

        if (aiNotStarted.length > 0) {
          lines.push('');
          lines.push('Ready for agent:');
          for (const i of aiNotStarted.slice(0, 10)) {
            lines.push(`  ${project.toUpperCase()}-${i.number} [${i.type}] [${i.priority}] ${i.title.slice(0, 60)}`);
          }
        }

        return text(lines.filter(l => l !== null).join('\n'));
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── get_backlog ───────────────────────────────────────────────────────────────
  server.tool(
    'get_backlog',
    'Get issues in the backlog (not assigned to any sprint)',
    {
      project: z.string().describe('Project key, e.g. TTMP'),
      limit: z.number().int().min(1).max(100).default(30),
    },
    async ({ project, limit }) => {
      try {
        const proj = await prisma.project.findUnique({ where: { key: project.toUpperCase() } });
        if (!proj) return errText(`Project ${project} not found`);

        const issues = await prisma.issue.findMany({
          where: {
            projectId: proj.id,
            sprintId: null,
            status: { notIn: ['DONE', 'CANCELLED'] },
          },
          include: {
            _count: { select: { children: true } },
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          take: limit,
        });

        if (issues.length === 0) return text('Backlog is empty.');

        const rows = issues.map(i =>
          `${project.toUpperCase()}-${i.number} [${i.type}] [${i.priority}] ${i.title.slice(0, 60)} | children: ${i._count.children}${i.aiEligible ? ' | AI✓' : ''}`,
        );
        return text(`Backlog (${issues.length} issues):\n${rows.join('\n')}`);
      } catch (err) {
        return errText(err);
      }
    },
  );
}
