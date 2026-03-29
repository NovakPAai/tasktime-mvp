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

export const pipelineApi = {
  health: () => pipelineFetch<PipelineHealth>('/api/health'),

  getBatches: () => pipelineFetch<StagingBatch[]>('/api/batches'),

  getBatch: (id: string) => pipelineFetch<StagingBatch>(`/api/batches/${id}`),

  createBatch: (data: { title: string; repo: string; createdBy: string; notes?: string }) =>
    pipelineFetch<StagingBatch>('/api/batches', { method: 'POST', body: JSON.stringify(data) }),

  transitionState: (id: string, state: StagingBatch['state'], extra?: { stagingUrl?: string; notes?: string; prodSha?: string }) =>
    pipelineFetch<StagingBatch>(`/api/batches/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state, ...extra }) }),

  addPr: (batchId: string, pr: Omit<PrSnapshot, 'id' | 'batchId'>) =>
    pipelineFetch<PrSnapshot>(`/api/batches/${batchId}/prs`, { method: 'POST', body: JSON.stringify(pr) }),

  removePr: (batchId: string, prId: string) =>
    pipelineFetch<void>(`/api/batches/${batchId}/prs/${prId}`, { method: 'DELETE' }),

  syncGitHub: () => pipelineFetch<{ synced: Record<string, number> }>('/api/github/sync', { method: 'POST' }),
};
