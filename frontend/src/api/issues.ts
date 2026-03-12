import api from './client';
import type { Issue, IssueType, IssuePriority, IssueStatus } from '../types';

export interface IssueFilters {
  status?: IssueStatus[];
  type?: IssueType[];
  priority?: IssuePriority[];
  assigneeId?: string;
  sprintId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listIssues(projectId: string, filters?: IssueFilters): Promise<Issue[]> {
  const { data } = await api.get<Issue[]>(`/projects/${projectId}/issues`, {
    params: {
      ...(filters?.status && { status: filters.status.join(',') }),
      ...(filters?.type && { type: filters.type.join(',') }),
      ...(filters?.priority && { priority: filters.priority.join(',') }),
      ...(filters?.assigneeId && { assigneeId: filters.assigneeId }),
      ...(filters?.sprintId && { sprintId: filters.sprintId }),
      ...(filters?.from && { from: filters.from }),
      ...(filters?.to && { to: filters.to }),
      ...(filters?.search && { search: filters.search }),
    },
  });
  return data;
}

export async function getIssue(id: string): Promise<Issue> {
  const { data } = await api.get<Issue>(`/issues/${id}`);
  return data;
}

export interface CreateIssueBody {
  title: string;
  description?: string;
  type?: IssueType;
  priority?: IssuePriority;
  parentId?: string;
  assigneeId?: string;
}

export async function createIssue(projectId: string, body: CreateIssueBody): Promise<Issue> {
  const { data } = await api.post<Issue>(`/projects/${projectId}/issues`, body);
  return data;
}

export async function updateIssue(id: string, body: Partial<CreateIssueBody>): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}`, body);
  return data;
}

export async function updateStatus(id: string, status: IssueStatus): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}/status`, { status });
  return data;
}

export async function deleteIssue(id: string): Promise<void> {
  await api.delete(`/issues/${id}`);
}

export async function bulkUpdateIssues(
  projectId: string,
  body: { issueIds: string[]; status?: IssueStatus; assigneeId?: string | null },
): Promise<{ updatedCount: number }> {
  const { data } = await api.post<{ updatedCount: number }>(`/projects/${projectId}/issues/bulk`, body);
  return data;
}
