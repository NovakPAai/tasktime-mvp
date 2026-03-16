import type { IssueStatus } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';

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
  for (const key of keys) {
    const dashIdx = key.lastIndexOf('-');
    if (dashIdx < 0) continue;
    const projectKey = key.slice(0, dashIdx);
    const number = parseInt(key.slice(dashIdx + 1), 10);
    if (Number.isNaN(number)) continue;

    const issues = await prisma.issue.findMany({
      where: {
        number,
        project: { key: projectKey },
        status: { notIn: ['DONE', 'CANCELLED'] },
      },
      select: { id: true },
    });

    for (const issue of issues) {
      await prisma.issue.update({ where: { id: issue.id }, data: { status } });
      await prisma.auditLog.create({
        data: {
          action: 'issue.status_changed',
          entityType: 'issue',
          entityId: issue.id,
          userId: null,
          details: { source: 'GITLAB', status, issueKey: key } as object,
          ipAddress: null,
          userAgent: null,
        },
      });
    }
  }
}
