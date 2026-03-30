import { prisma } from '../../prisma/client.js';
import { config } from '../../config.js';
import {
  listOpenPRs,
  getPRReviews,
  listCheckRunsForCommit,
  listWorkflowRuns,
  GithubPR,
} from '../github/github.client.js';
import type {
  PullRequestCiStatus,
  PullRequestReviewStatus,
} from '@prisma/client';

// ─── helpers ─────────────────────────────────────────────────────────────────

function mapCiStatus(
  status: string,
  conclusion: string | null,
): PullRequestCiStatus {
  if (status !== 'completed') return status === 'queued' ? 'PENDING' : 'RUNNING';
  switch (conclusion) {
    case 'success': return 'SUCCESS';
    case 'failure':
    case 'timed_out': return 'FAILURE';
    case 'cancelled': return 'CANCELLED';
    default: return 'PENDING';
  }
}

function mapReviewStatus(reviews: { state: string }[]): PullRequestReviewStatus {
  // Latest review per reviewer takes precedence
  const latest = new Map<string, string>();
  for (const r of reviews) latest.set((r as any).user?.login ?? 'unknown', r.state);
  const states = [...latest.values()];
  if (states.includes('CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
  if (states.includes('APPROVED')) return 'APPROVED';
  return 'PENDING';
}

function extractIssueKeys(pr: GithubPR): string[] {
  const text = `${pr.title} ${pr.body ?? ''}`;
  const matches = text.matchAll(/\b([A-Z]+-\d+)\b/g);
  return [...new Set([...matches].map(m => m[1]))];
}

// ─── sync PRs ────────────────────────────────────────────────────────────────

async function syncPRs(owner: string, repo: string): Promise<number> {
  const prs = await listOpenPRs(owner, repo);
  let upserted = 0;

  for (const pr of prs) {
    if (pr.draft) continue;

    const [reviews, checkRuns] = await Promise.all([
      getPRReviews(owner, repo, pr.number).catch(() => []),
      listCheckRunsForCommit(owner, repo, pr.head.sha).catch(() => []),
    ]);

    // Pick worst CI status across all check runs
    let ciStatus: PullRequestCiStatus = 'PENDING';
    let ciMessage: string | null = null;

    if (checkRuns.length > 0) {
      const statuses = checkRuns.map(c => mapCiStatus(c.status, c.conclusion));
      if (statuses.includes('FAILURE')) { ciStatus = 'FAILURE'; ciMessage = 'One or more checks failed'; }
      else if (statuses.includes('RUNNING')) ciStatus = 'RUNNING';
      else if (statuses.every(s => s === 'SUCCESS')) ciStatus = 'SUCCESS';
      else ciStatus = 'PENDING';
    }

    const reviewStatus = mapReviewStatus(reviews);
    const linkedIssueIds = extractIssueKeys(pr);

    await prisma.pullRequestSnapshot.upsert({
      where: { source_repo_externalId: { source: 'GITHUB', repo: `${owner}/${repo}`, externalId: pr.number } },
      create: {
        externalId: pr.number,
        source: 'GITHUB',
        repo: `${owner}/${repo}`,
        title: pr.title,
        author: pr.user.login,
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        hasConflicts: pr.mergeable === false,
        ciStatus,
        ciMessage,
        reviewStatus,
        htmlUrl: pr.html_url,
        lastSyncedAt: new Date(),
        linkedIssueIds,
        rawPayload: pr as object,
      },
      update: {
        title: pr.title,
        hasConflicts: pr.mergeable === false,
        ciStatus,
        ciMessage,
        reviewStatus,
        lastSyncedAt: new Date(),
        linkedIssueIds,
        rawPayload: pr as object,
      },
    });
    upserted++;
  }

  return upserted;
}

// ─── sync deploy events ───────────────────────────────────────────────────────

async function syncDeployRuns(owner: string, repo: string): Promise<number> {
  const runs = await listWorkflowRuns(owner, repo, { branch: 'main', limit: 30 });
  let upserted = 0;

  for (const run of runs) {
    if (!['push', 'workflow_dispatch', 'merge_group'].includes(run.event)) continue;

    const target = run.event === 'workflow_dispatch' ? 'PRODUCTION' : 'STAGING';

    const status = (() => {
      if (run.status !== 'completed') return run.status === 'queued' ? 'PENDING' : 'RUNNING';
      switch (run.conclusion) {
        case 'success': return 'SUCCESS';
        case 'failure': case 'timed_out': return 'FAILURE';
        default: return 'PENDING';
      }
    })() as any;

    const existing = await prisma.deployEvent.findFirst({
      where: { workflowRunId: run.id },
    });

    if (existing) {
      await prisma.deployEvent.update({
        where: { id: existing.id },
        data: {
          status,
          finishedAt: run.status === 'completed' ? new Date(run.updated_at) : null,
        },
      });
    } else {
      await prisma.deployEvent.create({
        data: {
          target,
          status,
          imageTag: run.head_sha.slice(0, 7),
          gitSha: run.head_sha,
          triggeredById: 'github-sync',
          workflowRunId: run.id,
          workflowRunUrl: run.html_url,
          startedAt: run.run_started_at ? new Date(run.run_started_at) : new Date(),
          finishedAt: run.status === 'completed' ? new Date(run.updated_at) : null,
        },
      });
    }
    upserted++;
  }

  return upserted;
}

// ─── main sync ────────────────────────────────────────────────────────────────

export async function runSync(): Promise<{ prs: number; deploys: number }> {
  const [ownerRepo] = config.GITHUB_REPOS.split(',').map(s => s.trim());
  if (!ownerRepo) throw new Error('GITHUB_REPOS is empty');

  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOS format: ${ownerRepo}. Expected owner/repo`);

  const [prs, deploys] = await Promise.all([
    syncPRs(owner, repo),
    syncDeployRuns(owner, repo),
  ]);

  await prisma.syncState.upsert({
    where: { syncType: 'github' },
    create: { syncType: 'github', lastSyncedAt: new Date(), syncCount: 1 },
    update: { lastSyncedAt: new Date(), syncCount: { increment: 1 }, errorMessage: null },
  });

  return { prs, deploys };
}

export async function runSyncSafe(): Promise<{ prs: number; deploys: number } | { error: string }> {
  try {
    return await runSync();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncState.upsert({
      where: { syncType: 'github' },
      create: { syncType: 'github', lastSyncedAt: new Date(), syncCount: 0, errorMessage: message },
      update: { lastSyncedAt: new Date(), errorMessage: message },
    }).catch(() => null);
    return { error: message };
  }
}
