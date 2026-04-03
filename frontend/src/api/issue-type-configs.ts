import api from './client';
import type { IssueTypeConfig } from '../types';

export async function listIssueTypeConfigs(includeDisabled = false): Promise<IssueTypeConfig[]> {
  const { data } = await api.get<IssueTypeConfig[]>('/admin/issue-type-configs', {
    params: includeDisabled ? { includeDisabled: 'true' } : {},
  });
  return data;
}

export async function createIssueTypeConfig(body: {
  name: string;
  description?: string;
  iconName: string;
  iconColor: string;
  isSubtask: boolean;
  orderIndex?: number;
}): Promise<IssueTypeConfig> {
  const { data } = await api.post<IssueTypeConfig>('/admin/issue-type-configs', body);
  return data;
}

export async function updateIssueTypeConfig(
  id: string,
  body: {
    name?: string;
    description?: string;
    iconName?: string;
    iconColor?: string;
    isSubtask?: boolean;
    orderIndex?: number;
  },
): Promise<IssueTypeConfig> {
  const { data } = await api.put<IssueTypeConfig>(`/admin/issue-type-configs/${id}`, body);
  return data;
}

export async function toggleIssueTypeConfig(id: string): Promise<IssueTypeConfig> {
  const { data } = await api.patch<IssueTypeConfig>(`/admin/issue-type-configs/${id}/toggle`);
  return data;
}

export async function deleteIssueTypeConfig(id: string): Promise<void> {
  await api.delete(`/admin/issue-type-configs/${id}`);
}

export async function getProjectIssueTypes(projectId: string): Promise<IssueTypeConfig[]> {
  const { data } = await api.get<IssueTypeConfig[]>(`/projects/${projectId}/issue-types`);
  return data;
}
