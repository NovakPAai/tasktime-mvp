import api from './client';
import type { Release, Issue } from '../types';

export async function listReleases(projectId: string): Promise<Release[]> {
  const { data } = await api.get<Release[]>(`/projects/${projectId}/releases`);
  return data;
}

export async function getReleaseWithIssues(releaseId: string): Promise<Release & { issues: Issue[] }> {
  const { data } = await api.get<Release & { issues: Issue[] }>(`/releases/${releaseId}/issues`);
  return data;
}

export async function createRelease(
  projectId: string,
  body: { name: string; description?: string; level: 'MINOR' | 'MAJOR' },
): Promise<Release> {
  const { data } = await api.post<Release>(`/projects/${projectId}/releases`, body);
  return data;
}

export async function updateRelease(
  releaseId: string,
  body: { name?: string; description?: string | null; level?: 'MINOR' | 'MAJOR'; state?: 'DRAFT' | 'READY' | 'RELEASED'; releaseDate?: string | null },
): Promise<Release> {
  const { data } = await api.patch<Release>(`/releases/${releaseId}`, body);
  return data;
}

export async function addIssuesToRelease(releaseId: string, issueIds: string[]): Promise<void> {
  await api.post(`/releases/${releaseId}/issues`, { issueIds });
}

export async function removeIssuesFromRelease(releaseId: string, issueIds: string[]): Promise<void> {
  await api.post(`/releases/${releaseId}/issues/remove`, { issueIds });
}

export async function markReleaseReady(releaseId: string): Promise<Release> {
  const { data } = await api.post<Release>(`/releases/${releaseId}/ready`);
  return data;
}

export async function markReleaseReleased(releaseId: string, releaseDate?: string): Promise<Release> {
  const { data } = await api.post<Release>(`/releases/${releaseId}/released`, { releaseDate });
  return data;
}
