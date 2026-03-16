import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import * as issuesService from '../issues/issues.service.js';
import type { AiEstimateDto, AiDecomposeDto } from './ai.dto.js';

const MIN_ESTIMATE_HOURS = 0.5;
const MAX_ESTIMATE_HOURS = 40;
const BASE_HOURS = 1;
const HOURS_PER_1000_CHARS = 0.5;

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

/**
 * Heuristic AI estimate: base + length-based component, capped.
 * MVP: no external LLM; replace with real model later.
 */
function computeEstimateHours(title: string, description: string | null): number {
  const text = `${title}\n${description ?? ''}`.trim();
  const len = text.length;
  const extra = (len / 1000) * HOURS_PER_1000_CHARS;
  const raw = BASE_HOURS + extra;
  const clamped = Math.min(MAX_ESTIMATE_HOURS, Math.max(MIN_ESTIMATE_HOURS, Math.round(raw * 2) / 2));
  return clamped;
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

    const estimatedHours = computeEstimateHours(issue.title, issue.description);

    await prisma.issue.update({
      where: { id: issue.id },
      data: { estimatedHours },
    });

    await setAiStatus(issueId, 'DONE');

    return {
      issueId: issue.id,
      estimatedHours,
    };
  } catch (err) {
    await setAiStatus(issueId, 'FAILED').catch(() => {});
    throw err;
  }
}

/**
 * Extract list items from description (bullets or numbered lines).
 * MVP: simple regex; no external LLM.
 */
function extractSubtasksFromDescription(description: string | null): string[] {
  if (!description?.trim()) return [];
  const lines = description.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    const bullet = line.replace(/^[\s]*[-*•]\s*/, '').replace(/^[\s]*\d+[.)]\s*/, '');
    if (bullet.length > 2) items.push(bullet);
  }
  return items.length > 0 ? items : [];
}

export async function decomposeIssue(dto: AiDecomposeDto, creatorId: string) {
  const issueId = await resolveIssueId(dto);

  await setAiStatus(issueId, 'IN_PROGRESS');

  try {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true, title: true, description: true, type: true },
    });
    if (!issue) throw new AppError(404, 'Issue not found');

    const allowedParents = ['EPIC', 'STORY', 'TASK'];
    if (!allowedParents.includes(issue.type)) {
      throw new AppError(400, `Issue type ${issue.type} cannot be decomposed into subtasks`);
    }

    const titles = extractSubtasksFromDescription(issue.description);
    const subtaskTitles = titles.length > 0 ? titles : ['Уточнить требования'];

    const created: Array<{ id: string; title: string; type: string; number: number }> = [];

    for (const title of subtaskTitles) {
      const child = await issuesService.createIssue(issue.projectId, creatorId, {
        title: title.slice(0, 500),
        description: undefined,
        type: 'SUBTASK',
        priority: 'MEDIUM',
        parentId: issue.id,
      });
      created.push({
        id: child.id,
        title: child.title,
        type: child.type,
        number: child.number,
      });
    }

    await setAiStatus(issueId, 'DONE');

    return {
      issueId: issue.id,
      createdCount: created.length,
      children: created,
    };
  } catch (err) {
    await setAiStatus(issueId, 'FAILED').catch(() => {});
    throw err;
  }
}
