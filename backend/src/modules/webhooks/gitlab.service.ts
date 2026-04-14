import type { SystemRoleType } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import type { GitLabMergeRequestPayload, GitLabPushPayload, GitLabPipelinePayload } from './webhooks.dto.js';
import { parseIssueKeys } from './webhooks.dto.js';
import { resolveWorkflowForIssue, executeTransition } from '../workflow-engine/workflow-engine.service.js';

const ISSUE_KEY_FULL_REGEX = /^([A-Z][A-Z0-9]*)-(\d+)$/;

/** Resolve issue by key (e.g. DEMO-42). Returns full issue object or null. */
async function findIssueByKey(issueKey: string) {
  const m = issueKey.match(ISSUE_KEY_FULL_REGEX);
  if (!m) return null;
  const [, projectKey, numStr] = m;
  const number = parseInt(numStr, 10);
  if (Number.isNaN(number)) return null;

  const project = await prisma.project.findUnique({ where: { key: projectKey }, select: { id: true } });
  if (!project) return null;

  return prisma.issue.findFirst({
    where: { projectId: project.id, number },
    select: { id: true, projectId: true, workflowStatusId: true, issueTypeConfigId: true, assigneeId: true, creatorId: true },
  });
}

/** Resolve issue id by key — kept for backward compat with pipeline handler. */
export async function findIssueIdByKey(issueKey: string): Promise<string | null> {
  const issue = await findIssueByKey(issueKey);
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
      details: { source: 'gitlab_webhook', ...details } as object,
      ipAddress: null,
      userAgent: null,
    },
  });
}

/** Get system actor for GitLab webhook transitions.
 *  Tries GITLAB_SYSTEM_USER_ID env var first, falls back to any ADMIN user. */
async function getSystemActor(): Promise<{ id: string; systemRoles: SystemRoleType[] } | null> {
  const envId = process.env.GITLAB_SYSTEM_USER_ID;
  if (envId) {
    const user = await prisma.user.findUnique({
      where: { id: envId },
      select: { id: true, systemRoles: { select: { role: true } } },
    });
    if (user) return { id: user.id, systemRoles: user.systemRoles.map((r) => r.role) };
  }
  const adminUser = await prisma.user.findFirst({
    where: { systemRoles: { some: { role: 'ADMIN' } } },
    select: { id: true, systemRoles: { select: { role: true } } },
  });
  if (!adminUser) return null;
  return { id: adminUser.id, systemRoles: adminUser.systemRoles.map((r) => r.role) };
}

/** Transition issue to the workflow status matching targetSystemKey via workflow engine.
 *  Uses bypassConditions=true since GitLab webhook is a trusted system source.
 *  Returns issueId on success, null if transition unavailable or actor not found. */
async function transitionIssueBySystemKey(
  issue: { id: string; projectId: string; workflowStatusId: string | null; issueTypeConfigId: string | null },
  targetSystemKey: string,
  reason: string,
  payloadDetails: Record<string, unknown>,
): Promise<string | null> {
  let workflow;
  try {
    workflow = await resolveWorkflowForIssue(issue);
  } catch {
    await logGitLabAudit('issue.gitlab_transition_unavailable', 'issue', issue.id, {
      reason: 'workflow_not_configured',
      targetSystemKey,
      ...payloadDetails,
    });
    return null;
  }

  const transition = workflow.transitions.find(
    (t) =>
      t.toStatus.systemKey === targetSystemKey &&
      (t.isGlobal || t.fromStatusId === issue.workflowStatusId),
  );

  if (!transition) {
    await logGitLabAudit('issue.gitlab_transition_unavailable', 'issue', issue.id, {
      reason: 'no_matching_transition',
      targetSystemKey,
      currentWorkflowStatusId: issue.workflowStatusId,
      ...payloadDetails,
    });
    return null;
  }

  const actor = await getSystemActor();
  if (!actor) {
    await logGitLabAudit('issue.gitlab_transition_skipped', 'issue', issue.id, {
      reason: 'no_system_actor',
      targetSystemKey,
      transitionId: transition.id,
      ...payloadDetails,
    });
    return null;
  }

  await executeTransition(issue.id, transition.id, actor.id, actor.systemRoles, undefined, true);

  await logGitLabAudit('issue.gitlab_webhook_transition', 'issue', issue.id, {
    transitionId: transition.id,
    transitionName: transition.name,
    targetSystemKey,
    actorId: actor.id,
    reason,
    ...payloadDetails,
  });

  return issue.id;
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

  let targetSystemKey: string | null = null;
  if (state === 'merged') targetSystemKey = 'DONE';
  else if (action === 'open' || state === 'opened') targetSystemKey = 'REVIEW';

  if (!targetSystemKey || uniqueKeys.length === 0) return { updated };

  const payloadDetails = { gitlab_state: state, gitlab_action: action };
  const reason = `merge_request ${state ?? action}`;

  for (const key of uniqueKeys) {
    const issue = await findIssueByKey(key);
    if (!issue) continue;
    const result = await transitionIssueBySystemKey(issue, targetSystemKey, reason, { issueKey: key, ...payloadDetails });
    if (result) updated.push(result);
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
    const issue = await findIssueByKey(key);
    if (!issue) continue;
    const result = await transitionIssueBySystemKey(issue, 'IN_PROGRESS', 'push to branch with issue key', {
      issueKey: key,
      ref,
      branch: branchName,
    });
    if (result) updated.push(result);
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
