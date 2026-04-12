import api from './client';
import type {
  Release,
  ReleaseItem,
  SprintInRelease,
  ReleaseReadiness,
  ReleaseTransitionsResponse,
  ReleaseAuditEntry,
} from '../types';

// ─── Global list ─────────────────────────────────────────────────────────────

export interface ListReleasesQuery {
  type?: 'ATOMIC' | 'INTEGRATION';
  statusId?: string;
  statusCategory?: string;
  projectId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listReleasesGlobal(
  query?: ListReleasesQuery,
): Promise<{ data: Release[]; total: number; page: number; limit: number }> {
  const { data } = await api.get('/releases', { params: query });
  return data;
}

export async function listReleases(projectId: string): Promise<Release[]> {
  const { data } = await api.get<Release[]>(`/projects/${projectId}/releases`);
  return data;
}

// ─── Single release ───────────────────────────────────────────────────────────

export async function getRelease(releaseId: string): Promise<Release> {
  const { data } = await api.get<Release>(`/releases/${releaseId}`);
  return data;
}

// ─── Release items (issues) ───────────────────────────────────────────────────

export async function getReleaseItems(
  releaseId: string,
  params?: { page?: number; limit?: number; projectId?: string },
): Promise<{ data: ReleaseItem[]; total: number; page: number; limit: number }> {
  const { data } = await api.get(`/releases/${releaseId}/items`, { params });
  return data;
}

export async function getReleaseWithIssues(releaseId: string): Promise<Release & { issues: unknown[] }> {
  const { data } = await api.get<Release & { issues: unknown[] }>(`/releases/${releaseId}/issues`);
  return data;
}

// ─── Sprints ──────────────────────────────────────────────────────────────────

export async function getReleaseSprints(releaseId: string): Promise<SprintInRelease[]> {
  const { data } = await api.get<SprintInRelease[]>(`/releases/${releaseId}/sprints`);
  return data;
}

// ─── Readiness ────────────────────────────────────────────────────────────────

export async function getReleaseReadiness(releaseId: string): Promise<ReleaseReadiness> {
  const { data } = await api.get<ReleaseReadiness>(`/releases/${releaseId}/readiness`);
  return data;
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function getReleaseHistory(releaseId: string): Promise<ReleaseAuditEntry[]> {
  const { data } = await api.get<ReleaseAuditEntry[]>(`/releases/${releaseId}/history`);
  return data;
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export async function getAvailableTransitions(releaseId: string): Promise<ReleaseTransitionsResponse> {
  const { data } = await api.get<ReleaseTransitionsResponse>(`/releases/${releaseId}/transitions`);
  return data;
}

export async function executeTransition(
  releaseId: string,
  transitionId: string,
  comment?: string,
): Promise<void> {
  await api.post(`/releases/${releaseId}/transitions/${transitionId}`, { comment });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRelease(
  projectId: string,
  body: { name: string; description?: string; level: 'MINOR' | 'MAJOR' },
): Promise<Release> {
  const { data } = await api.post<Release>(`/projects/${projectId}/releases`, body);
  return data;
}

export interface CreateReleaseGlobalBody {
  name: string;
  description?: string;
  level?: 'MINOR' | 'MAJOR';
  type?: 'ATOMIC' | 'INTEGRATION';
  projectId?: string;
  workflowId?: string;
  plannedDate?: string | null;
}

export async function createReleaseGlobal(body: CreateReleaseGlobalBody): Promise<Release> {
  const { data } = await api.post<Release>('/releases', body);
  return data;
}

export async function updateRelease(
  releaseId: string,
  body: {
    name?: string;
    description?: string | null;
    level?: 'MINOR' | 'MAJOR';
    plannedDate?: string | null;
    releaseDate?: string | null;
  },
): Promise<Release> {
  const { data } = await api.patch<Release>(`/releases/${releaseId}`, body);
  return data;
}

// ─── Items management ─────────────────────────────────────────────────────────

export async function addReleaseItems(releaseId: string, issueIds: string[]): Promise<void> {
  await api.post(`/releases/${releaseId}/items`, { issueIds });
}

export async function removeReleaseItems(releaseId: string, issueIds: string[]): Promise<void> {
  await api.post(`/releases/${releaseId}/items/remove`, { issueIds });
}

// ─── Legacy aliases ───────────────────────────────────────────────────────────

export async function addIssuesToRelease(releaseId: string, issueIds: string[]): Promise<void> {
  return addReleaseItems(releaseId, issueIds);
}

export async function removeIssuesFromRelease(releaseId: string, issueIds: string[]): Promise<void> {
  return removeReleaseItems(releaseId, issueIds);
}

export async function addSprintsToRelease(releaseId: string, sprintIds: string[]): Promise<void> {
  await api.post(`/releases/${releaseId}/sprints`, { sprintIds });
}

export async function removeSprintsFromRelease(releaseId: string, sprintIds: string[]): Promise<void> {
  await api.post(`/releases/${releaseId}/sprints/remove`, { sprintIds });
}

// ─── Deprecated (kept for backward compat) ────────────────────────────────────

export async function markReleaseReady(releaseId: string): Promise<Release> {
  const { data } = await api.post<Release>(`/releases/${releaseId}/ready`);
  return data;
}

export async function markReleaseReleased(releaseId: string, releaseDate?: string): Promise<Release> {
  const { data } = await api.post<Release>(`/releases/${releaseId}/released`, { releaseDate });
  return data;
}
