import api from './client';
import type { Issue, IssueType, IssuePriority, IssueStatus } from '../types';

export async function listIssues(projectId: string): Promise<Issue[]> {
  const { data } = await api.get<Issue[]>(`/projects/${projectId}/issues`);
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
