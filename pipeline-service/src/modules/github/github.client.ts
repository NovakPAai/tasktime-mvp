import { config } from '../../config.js';

export interface GithubPR {
  id: number;
  number: number;
  title: string;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  html_url: string;
  mergeable: boolean | null;
  draft: boolean;
  body: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
}

export interface GithubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  html_url: string;
}

export interface GithubWorkflowRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  run_started_at: string | null;
  updated_at: string;
  event: string;
  head_branch: string | null;
}

export interface GithubReview {
  id: number;
  user: { login: string };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submitted_at: string;
}

const BASE = 'https://api.github.com';

async function ghFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${config.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${path}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function listOpenPRs(owner: string, repo: string): Promise<GithubPR[]> {
  return ghFetch<GithubPR[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`);
}

const MAX_PAGES = 20; // ~2000 PRs max — guard against GitHub rate-limit exhaustion

export interface ListMergedPrsResult {
  prs: GithubPR[];
  /** true when MAX_PAGES was reached — sync cursor must NOT be advanced */
  truncated: boolean;
}

export async function listMergedPrs(repo: string, since?: Date): Promise<ListMergedPrsResult> {
  const [owner, repoName] = repo.split('/');
  const result: GithubPR[] = [];
  let page = 1;
  let truncated = false;

  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({ state: 'closed', per_page: '100', sort: 'updated', direction: 'desc', page: String(page) });
    const prs = await ghFetch<GithubPR[]>(`/repos/${owner}/${repoName}/pulls?${params}`);
    if (!prs.length) break;

    for (const pr of prs) {
      if (!pr.merged_at) continue;
      // Don't stop early — updated_at order ≠ merged_at order, collect all pages then filter
      if (!since || new Date(pr.merged_at) > since) {
        result.push(pr);
      }
    }

    if (prs.length < 100) break; // last page
    page++;
  }

  if (page > MAX_PAGES) {
    truncated = true;
    console.warn(`[listMergedPrs] Hit MAX_PAGES (${MAX_PAGES}) for ${repo} — results truncated, sync cursor will not advance`);
  }

  return { prs: result, truncated };
}

export async function getPrChecks(repo: string, sha: string): Promise<GithubCheckRun[]> {
  const [owner, repoName] = repo.split('/');
  return listCheckRunsForCommit(owner, repoName, sha);
}

export async function getPRReviews(owner: string, repo: string, prNumber: number): Promise<GithubReview[]> {
  return ghFetch<GithubReview[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);
}

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  opts: { branch?: string; limit?: number } = {},
): Promise<GithubWorkflowRun[]> {
  const params = new URLSearchParams();
  if (opts.branch) params.set('branch', opts.branch);
  params.set('per_page', String(opts.limit ?? 20));
  const { workflow_runs } = await ghFetch<{ workflow_runs: GithubWorkflowRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?${params}`,
  );
  return workflow_runs;
}

export async function listCheckRunsForCommit(
  owner: string,
  repo: string,
  sha: string,
): Promise<GithubCheckRun[]> {
  const { check_runs } = await ghFetch<{ check_runs: GithubCheckRun[] }>(
    `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
  );
  return check_runs;
}
