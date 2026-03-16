import type { IssueStatus } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import type { GitLabMergeRequestPayload, GitLabPushPayload, GitLabPipelinePayload } from './webhooks.dto.js';
import { parseIssueKeys } from './webhooks.dto.js';

const ISSUE_KEY_FULL_REGEX = /^([A-Z][A-Z0-9]*)-(\d+)$/;

/** Resolve issue by key (e.g. DEMO-42). Returns issue id or null. */
export async function findIssueIdByKey(issueKey: string): Promise<string | null> {
  const m = issueKey.match(ISSUE_KEY_FULL_REGEX);
  if (!m) return null;
  const [, projectKey, numStr] = m;
  const number = parseInt(numStr, 10);
  if (Number.isNaN(number)) return null;

  const project = await prisma.project.findUnique({ where: { key: projectKey }, select: { id: true } });
  if (!project) return null;

  const issue = await prisma.issue.findFirst({
    where: { projectId: project.id, number },
    select: { id: true },
  });
  return issue?.id ?? null;
}

/** Log audit for GitLab-driven action (no user context). */
async function logGitLabAudit(action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      userId: null,
      details: { source: 'GITLAB', ...details } as object,
      ipAddress: null,
      userAgent: null,
    },
  });
}

/** Update issue status and write audit log. */
async function setIssueStatus(issueId: string, status: string, reason: string, payloadDetails: Record<string, unknown>) {
  await prisma.issue.update({ where: { id: issueId }, data: { status: status as IssueStatus } });
  await logGitLabAudit('issue.status_changed', 'issue', issueId, {
    status,
    reason,
    ...payloadDetails,
  });
}

/** Handle merge_request: opened -> REVIEW, merged -> DONE. */
export async function handleMergeRequest(body: GitLabMergeRequestPayload): Promise<{ updated: string[] }> {
  const updated: string[] = [];
  const state = body.object_attributes?.state;
  const action = body.object_attributes?.action;
  const title = body.object_attributes?.title ?? '';
  const sourceBranch = body.object_attributes?.source_branch ?? '';

  const keys = [...parseIssueKeys(title), ...parseIssueKeys(sourceBranch)];
  const uniqueKeys = Array.from(new Set(keys));

  let newStatus: string | null = null;
  if (state === 'merged') newStatus = 'DONE';
  else if (action === 'open' || state === 'opened') newStatus = 'REVIEW';

  if (!newStatus || uniqueKeys.length === 0) return { updated };

  for (const key of uniqueKeys) {
    const issueId = await findIssueIdByKey(key);
    if (!issueId) continue;
    await setIssueStatus(issueId, newStatus, `merge_request ${state ?? action}`, {
      issueKey: key,
      gitlab_state: state,
      gitlab_action: action,
    });
    updated.push(issueId);
  }
  return { updated };
}

/** Handle push: branch/commit contains issue key -> IN_PROGRESS. */
export async function handlePush(body: GitLabPushPayload): Promise<{ updated: string[] }> {
  const updated: string[] = [];
  const ref = body.ref ?? '';
  const branchName = ref.replace(/^refs\/heads\//, '');
  const keys = parseIssueKeys(branchName);
  for (const msg of body.commits ?? []) {
    parseIssueKeys(msg?.message ?? '').forEach((k) => keys.push(k));
    parseIssueKeys(msg?.title ?? '').forEach((k) => keys.push(k));
  }
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) return { updated };

  for (const key of uniqueKeys) {
    const issueId = await findIssueIdByKey(key);
    if (!issueId) continue;
    await setIssueStatus(issueId, 'IN_PROGRESS', 'push to branch with issue key', {
      issueKey: key,
      ref,
      branch: branchName,
    });
    updated.push(issueId);
  }
  return { updated };
}

/** Handle pipeline: optional comment to issue (if key found in ref/commits). */
export async function handlePipeline(body: GitLabPipelinePayload): Promise<{ updated: string[]; commented: string[] }> {
  const updated: string[] = [];
  const commented: string[] = [];
  const ref = body.object_attributes?.ref ?? '';
  const branchName = ref.replace(/^refs\/heads\//, '');
  const status = body.object_attributes?.status ?? '';
  const keys = parseIssueKeys(branchName);
  for (const c of body.commits ?? []) {
    parseIssueKeys(c?.message ?? '').forEach((k) => keys.push(k));
    parseIssueKeys(c?.title ?? '').forEach((k) => keys.push(k));
  }
  const uniqueKeys = Array.from(new Set(keys));

  if (uniqueKeys.length === 0) return { updated, commented };

  const systemUserId = process.env.GITLAB_SYSTEM_USER_ID;
  const commentBody = `Pipeline ${status}: ${ref}`;

  for (const key of uniqueKeys) {
    const issueId = await findIssueIdByKey(key);
    if (!issueId) continue;
    await logGitLabAudit('issue.gitlab_pipeline', 'issue', issueId, {
      issueKey: key,
      pipeline_status: status,
      ref,
    });
    updated.push(issueId);
    if (systemUserId) {
      try {
        await prisma.comment.create({
          data: { issueId, authorId: systemUserId, body: commentBody },
        });
        commented.push(issueId);
      } catch {
        // ignore comment creation errors (e.g. user not found)
      }
    }
  }
  return { updated, commented };
}
