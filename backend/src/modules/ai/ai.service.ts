import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { AI_DEVELOPER_EMAIL } from '../../prisma/bootstrap.js';
import * as issuesService from '../issues/issues.service.js';
import { getLlmProvider } from './providers/index.js';
import type { AiEstimateDto, AiDecomposeDto } from './ai.dto.js';

let _aiDeveloperId: string | null = null;

async function getAiDeveloperId(): Promise<string> {
  if (_aiDeveloperId) return _aiDeveloperId;
  const user = await prisma.user.findUnique({ where: { email: AI_DEVELOPER_EMAIL }, select: { id: true } });
  if (!user) throw new AppError(500, 'AI Developer system account not found. Run db:seed to create it.');
  _aiDeveloperId = user.id;
  return _aiDeveloperId;
}

async function resolveIssueId(dto: { issueId?: string; issueKey?: string }): Promise<string> {
  if (dto.issueId) return dto.issueId;
  if (dto.issueKey) {
    const issue = await issuesService.getIssueByKey(dto.issueKey);
    return issue.id;
  }
  throw new AppError(400, 'Either issueId or issueKey is required');
}

function setAiStatus(issueId: string, status: 'IN_PROGRESS' | 'DONE' | 'FAILED'): Promise<unknown> {
  return prisma.issue.update({
    where: { id: issueId },
    data: { aiExecutionStatus: status },
  });
}

export async function estimateIssue(dto: AiEstimateDto) {
  const issueId = await resolveIssueId(dto);
  await setAiStatus(issueId, 'IN_PROGRESS');

  try {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, title: true, description: true, projectId: true },
    });
    if (!issue) throw new AppError(404, 'Issue not found');

    const provider = getLlmProvider();
    const { hours, reasoning } = await provider.estimateIssue(issue.title, issue.description);

    await prisma.issue.update({
      where: { id: issue.id },
      data: { estimatedHours: hours, aiReasoning: reasoning },
    });

    await setAiStatus(issueId, 'DONE');

    return { issueId: issue.id, estimatedHours: hours, reasoning };
  } catch (err) {
    await setAiStatus(issueId, 'FAILED').catch(() => {});
    throw err;
  }
}

export async function suggestAssignee(dto: { issueId?: string; issueKey?: string }) {
  const issueId = await resolveIssueId(dto);

  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { id: true, projectId: true, sprintId: true },
  });
  if (!issue) throw new AppError(404, 'Issue not found');

  // Find active sprint for the project
  const activeSprint = await prisma.sprint.findFirst({
    where: { projectId: issue.projectId, state: 'ACTIVE' },
    select: { id: true },
  });

  const sprintId = issue.sprintId ?? activeSprint?.id;

  // Get all users with their logged hours in the current sprint (or last 7 days)
  const since = sprintId
    ? undefined
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['USER', 'MANAGER'] } },
    select: {
      id: true,
      name: true,
      email: true,
      timeLogs: {
        where: {
          ...(sprintId
            ? { issue: { sprintId } }
            : { createdAt: { gte: since } }),
        },
        select: { hours: true },
      },
      assignedIssues: {
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS', 'REVIEW'] },
          ...(sprintId ? { sprintId } : {}),
        },
        select: { id: true },
      },
    },
  });

  const ranked = users
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      loggedHours: u.timeLogs.reduce((sum, l) => sum + Number(l.hours), 0),
      openIssues: u.assignedIssues.length,
    }))
    .sort((a, b) => a.loggedHours - b.loggedHours || a.openIssues - b.openIssues);

  const suggested = ranked[0] ?? null;

  return {
    issueId,
    suggested: suggested
      ? {
          userId: suggested.id,
          name: suggested.name,
          email: suggested.email,
          loggedHours: suggested.loggedHours,
          openIssues: suggested.openIssues,
          reason: `Наименьшая нагрузка в спринте: ${suggested.loggedHours}ч, ${suggested.openIssues} задач`,
        }
      : null,
    candidates: ranked.slice(0, 5).map((u) => ({
      userId: u.id,
      name: u.name,
      loggedHours: u.loggedHours,
      openIssues: u.openIssues,
    })),
  };
}

export async function decomposeIssue(dto: AiDecomposeDto) {
  const issueId = await resolveIssueId(dto);
  await setAiStatus(issueId, 'IN_PROGRESS');

  try {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true, title: true, description: true, issueTypeConfig: { select: { systemKey: true } } },
    });
    if (!issue) throw new AppError(404, 'Issue not found');

    const systemKey = issue.issueTypeConfig?.systemKey ?? null;
    const allowedParents = ['EPIC', 'STORY', 'TASK'];
    if (!systemKey || !allowedParents.includes(systemKey)) {
      throw new AppError(400, `Issue type ${systemKey ?? 'custom'} cannot be decomposed into subtasks`);
    }

    const provider = getLlmProvider();
    const { subtasks: subtaskTitles } = await provider.decomposeIssue(
      issue.title,
      issue.description,
      systemKey,
    );

    const aiDeveloperId = await getAiDeveloperId();
    const created: Array<{ id: string; title: string; systemKey: string; number: number }> = [];
    for (const title of subtaskTitles) {
      const child = await issuesService.createIssue(issue.projectId, aiDeveloperId, {
        title: title.slice(0, 500),
        description: undefined,
        type: 'SUBTASK',
        priority: 'MEDIUM',
        parentId: issue.id,
        assigneeId: aiDeveloperId,
      });
      created.push({ id: child.id, title: child.title, systemKey: child.issueTypeConfig?.systemKey ?? 'SUBTASK', number: child.number });
    }

    await setAiStatus(issueId, 'DONE');

    return { issueId: issue.id, createdCount: created.length, children: created };
  } catch (err) {
    await setAiStatus(issueId, 'FAILED').catch(() => {});
    throw err;
  }
}
