import api from './client';
import type { IssueTypeScheme } from '../types';

export async function listIssueTypeSchemes(): Promise<IssueTypeScheme[]> {
  const { data } = await api.get<IssueTypeScheme[]>('/admin/issue-type-schemes');
  return data;
}

export async function getIssueTypeScheme(id: string): Promise<IssueTypeScheme> {
  const { data } = await api.get<IssueTypeScheme>(`/admin/issue-type-schemes/${id}`);
  return data;
}

export async function createIssueTypeScheme(body: {
  name: string;
  description?: string;
}): Promise<IssueTypeScheme> {
  const { data } = await api.post<IssueTypeScheme>('/admin/issue-type-schemes', body);
  return data;
}

export async function updateIssueTypeScheme(
  id: string,
  body: { name?: string; description?: string },
): Promise<IssueTypeScheme> {
  const { data } = await api.put<IssueTypeScheme>(`/admin/issue-type-schemes/${id}`, body);
  return data;
}

export async function deleteIssueTypeScheme(id: string): Promise<void> {
  await api.delete(`/admin/issue-type-schemes/${id}`);
}

export async function updateSchemeItems(
  schemeId: string,
  items: { typeConfigId: string; orderIndex: number }[],
): Promise<IssueTypeScheme> {
  const { data } = await api.put<IssueTypeScheme>(`/admin/issue-type-schemes/${schemeId}/items`, { items });
  return data;
}

export async function assignProjectToScheme(
  schemeId: string,
  projectId: string,
): Promise<{ id: string; schemeId: string; projectId: string; project: { id: string; name: string; key: string } }> {
  const { data } = await api.post(`/admin/issue-type-schemes/${schemeId}/projects`, { projectId });
  return data;
}

export async function removeProjectFromScheme(schemeId: string, projectId: string): Promise<void> {
  await api.delete(`/admin/issue-type-schemes/${schemeId}/projects/${projectId}`);
}
