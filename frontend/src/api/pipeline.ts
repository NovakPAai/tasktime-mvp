// In production nginx proxies /pipeline/ → pipeline-service:3100/ and injects the API key server-side.
// In development set VITE_PIPELINE_URL=http://localhost:3100 and VITE_PIPELINE_API_KEY in .env.local.
const BASE = import.meta.env.VITE_PIPELINE_URL ?? '/pipeline';
const DEV_KEY = import.meta.env.VITE_PIPELINE_API_KEY;

async function pipelineFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options?.headers as Record<string, string> };
  // In development the key is injected here; in production nginx injects it server-side
  if (DEV_KEY) headers['x-pipeline-api-key'] = DEV_KEY;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pipeline API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Frontend interfaces (UI-facing) ──────────────────────────────────────────

export interface PrSnapshot {
  id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string;
  headSha: string;
  mergedAt: string | null;
  ciStatus: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'SKIPPED';
  batchId: string;
}

export interface DeployEvent {
  id: string;
  env: string;
  sha: string;
  triggeredBy: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
  durationMs: number | null;
  logUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
}

export interface StagingBatch {
  id: string;
  title: string;
  state: 'COLLECTING' | 'DEPLOYING' | 'TESTING' | 'PASSED' | 'FAILED' | 'RELEASED';
  repo: string;
  createdBy: string;
  notes: string | null;
  stagingUrl: string | null;
  prodSha: string | null;
  createdAt: string;
  updatedAt: string;
  pullRequests: PrSnapshot[];
  deploys: DeployEvent[];
}

export interface PipelineHealth {
  status: string;
  service: string;
  version: string;
  buildTime: string;
}

// ── Backend → Frontend mappers ───────────────────────────────────────────────
// Pipeline-service returns different field names and envelope wrappers.
// These mappers bridge the gap without touching backend code.

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapPr(raw: any): PrSnapshot {
  return {
    id: raw.id,
    prNumber: raw.externalId ?? raw.prNumber ?? 0,
    prTitle: raw.title ?? raw.prTitle ?? '',
    prUrl: raw.htmlUrl ?? raw.prUrl ?? '',
    author: raw.author ?? '',
    headSha: raw.mergedSha ?? raw.branch ?? raw.headSha ?? '',
    mergedAt: raw.mergedAt ?? null,
    ciStatus: raw.ciStatus ?? 'PENDING',
    batchId: raw.stagingBatchId ?? raw.batchId ?? '',
  };
}

function mapDeploy(raw: any): DeployEvent {
  return {
    id: raw.id,
    env: raw.target?.toLowerCase() ?? raw.env ?? '',
    sha: raw.gitSha ?? raw.imageTag ?? raw.sha ?? '',
    triggeredBy: raw.triggeredById ?? raw.triggeredBy ?? '',
    status: raw.status ?? 'RUNNING',
    durationMs: raw.durationMs ?? null,
    logUrl: raw.workflowRunUrl ?? raw.logUrl ?? null,
    errorMsg: raw.errorMessage ?? raw.errorMsg ?? null,
    createdAt: raw.startedAt ?? raw.createdAt ?? '',
  };
}

function mapBatch(raw: any): StagingBatch {
  return {
    id: raw.id,
    title: raw.name ?? raw.title ?? '',
    state: raw.state ?? 'COLLECTING',
    repo: raw.repo ?? '',
    createdBy: raw.createdById ?? raw.createdBy ?? '',
    notes: raw.notes ?? null,
    stagingUrl: raw.stagingUrl ?? null,
    prodSha: raw.prodSha ?? null,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
    pullRequests: (raw.pullRequests ?? []).map(mapPr),
    deploys: (raw.deployEvents ?? raw.deploys ?? []).map(mapDeploy),
  };
}

/** Unwrap envelope: {data: T} → T, or return as-is if no envelope */
function unwrap<T>(body: any): T {
  if (body && typeof body === 'object' && 'data' in body) return body.data;
  return body;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Public API ───────────────────────────────────────────────────────────────

export const pipelineApi = {
  health: () => pipelineFetch<PipelineHealth>('/api/health'),

  getBatches: async (): Promise<StagingBatch[]> => {
    const raw = await pipelineFetch<unknown>('/api/batches');
    const items = unwrap<unknown[]>(raw);
    return (Array.isArray(items) ? items : []).map(mapBatch);
  },

  getBatch: async (id: string): Promise<StagingBatch> => {
    const raw = await pipelineFetch<unknown>(`/api/batches/${id}`);
    return mapBatch(unwrap(raw));
  },

  createBatch: async (data: { title: string; notes?: string }): Promise<StagingBatch> => {
    const raw = await pipelineFetch<unknown>('/api/batches', {
      method: 'POST',
      body: JSON.stringify({ name: data.title, notes: data.notes }),
    });
    return mapBatch(unwrap(raw));
  },

  transitionState: async (id: string, state: StagingBatch['state'], extra?: { notes?: string }): Promise<StagingBatch> => {
    const raw = await pipelineFetch<unknown>(`/api/batches/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state, ...extra }),
    });
    return mapBatch(unwrap(raw));
  },

  addPr: async (batchId: string, prIds: string[]): Promise<StagingBatch> => {
    const raw = await pipelineFetch<unknown>(`/api/batches/${batchId}/prs`, {
      method: 'POST',
      body: JSON.stringify({ prIds }),
    });
    return mapBatch(unwrap(raw));
  },

  removePr: (batchId: string, prId: string) =>
    pipelineFetch<void>(`/api/batches/${batchId}/prs/${prId}`, { method: 'DELETE' }),

  syncGitHub: () => pipelineFetch<{ synced: number; repo: string; truncated: boolean }>('/api/github/sync', { method: 'POST' }),
};
