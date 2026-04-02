import api from './client';
import type { Sprint, Issue, SprintState, SprintDetailsResponse, PaginatedResponse, PaginationMeta } from '../types';

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export async function listSprints(
  projectId: string,
  pagination?: PaginationQuery,
): Promise<PaginatedResponse<Sprint>> {
  const { data } = await api.get<PaginatedResponse<Sprint>>(`/projects/${projectId}/sprints`, {
    params: pagination,
  });
  return data;
}

interface CreateOrUpdateSprintBody {
  name?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  projectTeamId?: string | null;
  businessTeamId?: string | null;
  flowTeamId?: string | null;
}

export async function createSprint(
  projectId: string,
  body: { name: string; goal?: string; startDate?: string; endDate?: string; projectTeamId?: string; businessTeamId?: string; flowTeamId?: string },
): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/projects/${projectId}/sprints`, body);
  return data;
}

export async function updateSprint(id: string, body: Partial<CreateOrUpdateSprintBody>): Promise<Sprint> {
  const { data } = await api.patch<Sprint>(`/sprints/${id}`, body);
  return data;
}

export async function startSprint(id: string): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/sprints/${id}/start`);
  return data;
}

export async function closeSprint(id: string): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/sprints/${id}/close`);
  return data;
}

export async function moveIssuesToSprint(sprintId: string, issueIds: string[]) {
  await api.post(`/sprints/${sprintId}/issues`, { issueIds });
}

export async function getBacklog(
  projectId: string,
  pagination?: PaginationQuery,
): Promise<PaginatedResponse<Issue>> {
  const { data } = await api.get<PaginatedResponse<Issue>>(`/projects/${projectId}/backlog`, {
    params: pagination,
  });
  return data;
}

export async function moveIssuesToBacklog(projectId: string, issueIds: string[]) {
  await api.post(`/projects/${projectId}/backlog/issues`, { issueIds });
}

export async function listAllSprints(
  params?: { state?: SprintState | 'ALL'; projectId?: string; teamId?: string },
  pagination?: PaginationQuery,
): Promise<PaginatedResponse<Sprint>> {
  const { data } = await api.get<PaginatedResponse<Sprint>>('/sprints', {
    params: { ...params, ...pagination },
  });
  return data;
}

export async function getSprintIssues(id: string): Promise<SprintDetailsResponse> {
  const { data } = await api.get<SprintDetailsResponse>(`/sprints/${id}/issues`);
  return data;
}

// Re-export PaginationMeta for convenience
export type { PaginationMeta };
