import api from './client';
import type { Sprint, Issue } from '../types';

export async function listSprints(projectId: string): Promise<Sprint[]> {
  const { data } = await api.get<Sprint[]>(`/projects/${projectId}/sprints`);
  return data;
}

export async function createSprint(projectId: string, body: { name: string; goal?: string; startDate?: string; endDate?: string }): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/projects/${projectId}/sprints`, body);
  return data;
}

export async function updateSprint(id: string, body: Partial<{ name: string; goal: string | null; startDate: string | null; endDate: string | null }>): Promise<Sprint> {
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

export async function getBacklog(projectId: string): Promise<Issue[]> {
  const { data } = await api.get<Issue[]>(`/projects/${projectId}/backlog`);
  return data;
}

export async function moveIssuesToBacklog(projectId: string, issueIds: string[]) {
  await api.post(`/projects/${projectId}/backlog/issues`, { issueIds });
}
