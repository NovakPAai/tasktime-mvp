// In production nginx proxies /pipeline/ → pipeline-service:3100/ and injects the API key server-side.
// In development falls back to http://localhost:3100 (direct). Override with VITE_PIPELINE_URL in .env.local.
// In production nginx proxies /pipeline/api/ → pipeline-service:3100/api/
// In development falls back to http://localhost:3100 (direct)
const BASE = import.meta.env.VITE_PIPELINE_URL ?? (import.meta.env.DEV ? 'http://localhost:3100' : '/pipeline');
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

// Pipeline API wraps list responses in { data: T[], total, limit, offset }
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export const pipelineApi = {
  health: () => pipelineFetch<PipelineHealth>('/api/health'),

  getBatches: async (): Promise<StagingBatch[]> => {
    const res = await pipelineFetch<PaginatedResponse<StagingBatch>>('/api/batches');
    return res.data;
  },

  getBatch: async (id: string): Promise<StagingBatch> => {
    const res = await pipelineFetch<{ data: StagingBatch }>(`/api/batches/${id}`);
    return res.data;
  },

  createBatch: async (data: { title: string; repo: string; createdBy: string; notes?: string }): Promise<StagingBatch> => {
    const res = await pipelineFetch<{ data: StagingBatch }>('/api/batches', { method: 'POST', body: JSON.stringify(data) });
    return res.data;
  },

  transitionState: async (id: string, state: StagingBatch['state'], extra?: { stagingUrl?: string; notes?: string; prodSha?: string }): Promise<StagingBatch> => {
    const res = await pipelineFetch<{ data: StagingBatch }>(`/api/batches/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state, ...extra }) });
    return res.data;
  },

  addPr: async (batchId: string, pr: Omit<PrSnapshot, 'id' | 'batchId'>): Promise<PrSnapshot> => {
    const res = await pipelineFetch<{ data: PrSnapshot }>(`/api/batches/${batchId}/prs`, { method: 'POST', body: JSON.stringify(pr) });
    return res.data;
  },

  removePr: (batchId: string, prId: string) =>
    pipelineFetch<void>(`/api/batches/${batchId}/prs/${prId}`, { method: 'DELETE' }),

  syncGitHub: () => pipelineFetch<{ synced: Record<string, number> }>('/api/github/sync', { method: 'POST' }),
};
