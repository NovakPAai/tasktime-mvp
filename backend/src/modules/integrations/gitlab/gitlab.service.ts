import type { IssueStatus } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { delCacheByPrefix } from '../../../shared/redis.js';

/** Extract issue keys like PROJ-42 from text (branch name, commit message, MR title). */
export function extractIssueKeys(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/g);
  return matches ? [...new Set(matches)] : [];
}

export async function handleWebhook(payload: Record<string, unknown>): Promise<void> {
  const objectKind = payload['object_kind'] as string | undefined;

  if (objectKind === 'push') {
    await handlePush(payload);
  } else if (objectKind === 'merge_request') {
    await handleMergeRequest(payload);
  }
}

async function handlePush(payload: Record<string, unknown>): Promise<void> {
  const ref = (payload['ref'] as string) ?? '';
  const branchName = ref.replace(/^refs\/heads\//, '');
  const commits = (payload['commits'] as Array<{ message?: string; title?: string }> | undefined) ?? [];
  const keys = [
    ...extractIssueKeys(branchName),
    ...commits.flatMap((c) => [...extractIssueKeys(c.message ?? ''), ...extractIssueKeys(c.title ?? '')]),
  ];
  const uniqueKeys = keys.length ? [...new Set(keys)] : [];
  if (uniqueKeys.length === 0) return;
  await updateIssuesByKeys(uniqueKeys, 'IN_PROGRESS');
}

async function handleMergeRequest(payload: Record<string, unknown>): Promise<void> {
  const attrs = payload['object_attributes'] as Record<string, unknown> | undefined;
  if (!attrs) return;

  const title = (attrs['title'] as string) ?? '';
  const description = (attrs['description'] as string) ?? '';
  const sourceBranch = (attrs['source_branch'] as string) ?? '';
  const state = attrs['state'] as string | undefined;
  const action = attrs['action'] as string | undefined;

  const keys = [
    ...extractIssueKeys(title),
    ...extractIssueKeys(description),
    ...extractIssueKeys(sourceBranch),
  ];
  const uniqueKeys = keys.length ? [...new Set(keys)] : [];
  if (uniqueKeys.length === 0) return;

  let status: IssueStatus | null = null;
  if (action === 'open' || state === 'opened') status = 'REVIEW';
  else if (action === 'merge' || state === 'merged') status = 'DONE';
  else if (action === 'close' || state === 'closed') status = 'DONE';

  if (!status) return;
  await updateIssuesByKeys(uniqueKeys, status);
}

async function updateIssuesByKeys(keys: string[], status: IssueStatus): Promise<void> {
  // Parse all keys upfront, skip malformed ones
  const parsed = keys.flatMap((key) => {
    const dashIdx = key.lastIndexOf('-');
    if (dashIdx < 0) return [];
    const projectKey = key.slice(0, dashIdx);
    const number = parseInt(key.slice(dashIdx + 1), 10);
    if (Number.isNaN(number)) return [];
    return [{ key, projectKey, number }];
  });

  if (parsed.length === 0) return;

  // 1 query: fetch all matching issues across all keys
  const issues = await prisma.issue.findMany({
    where: {
      status: { notIn: ['DONE', 'CANCELLED'] },
      OR: parsed.map(({ projectKey, number }) => ({
        number,
        project: { key: projectKey },
      })),
    },
    select: {
      id: true,
      projectId: true,
      number: true,
      project: { select: { key: true } },
    },
  });

  if (issues.length === 0) return;

  // Build issueId → original issue key mapping for audit log details
  const keyByIssueId = new Map<string, string>(
    issues.map((i) => {
      const match = parsed.find(
        (p) => p.number === i.number && p.projectKey === i.project.key,
      );
      return [i.id, match?.key ?? `${i.project.key}-${i.number}`];
    }),
  );

  const issueIds = issues.map((i) => i.id);

  // Wrap in a transaction to eliminate TOCTOU: between findMany above and the
  // write below another request could close one of these issues. Re-applying the
  // terminal-state guard inside the transaction ensures we only update (and audit)
  // issues that are still non-terminal at write time.
  const projectIds = [...new Set(issues.map((i) => i.projectId))];

  await prisma.$transaction(async (tx) => {
    const updatable = await tx.issue.findMany({
      where: { id: { in: issueIds }, status: { notIn: ['DONE', 'CANCELLED'] } },
      select: { id: true },
    });

    const updatableIds = updatable.map((i) => i.id);
    if (updatableIds.length === 0) return;

    // batch update — only non-terminal issues
    await tx.issue.updateMany({
      where: { id: { in: updatableIds } },
      data: { status },
    });

    // batch audit — only for records that were actually changed
    await tx.auditLog.createMany({
      data: updatableIds.map((id) => ({
        action: 'issue.status_changed',
        entityType: 'issue',
        entityId: id,
        userId: null,
        details: { source: 'GITLAB', status, issueKey: keyByIssueId.get(id) } as object,
        ipAddress: null,
        userAgent: null,
      })),
    });
  });

  // Invalidate issue list caches for all affected projects
  await Promise.all(projectIds.map((pid) => delCacheByPrefix(`issues:list:${pid}:`)));
}
