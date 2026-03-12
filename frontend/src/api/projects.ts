import api from './client';
import type { Project, IssueStatus, IssueType, IssuePriority } from '../types';

export async function listProjects(): Promise<Project[]> {
  const { data } = await api.get<Project[]>('/projects');
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<Project>(`/projects/${id}`);
  return data;
}

export async function createProject(body: { name: string; key: string; description?: string }): Promise<Project> {
  const { data } = await api.post<Project>('/projects', body);
  return data;
}

export async function updateProject(id: string, body: { name?: string; description?: string }): Promise<Project> {
  const { data } = await api.patch<Project>(`/projects/${id}`, body);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export interface ProjectDashboard {
  project: {
    id: string;
    name: string;
    key: string;
  };
  issuesByStatus: { status: IssueStatus; _count: { _all: number } }[];
  issuesByType: { type: IssueType; _count: { _all: number } }[];
  issuesByPriority: { priority: IssuePriority; _count: { _all: number } }[];
  totals: {
    totalIssues: number;
    doneIssues: number;
  };
  activeSprint: {
    id: string;
    name: string;
    state: string;
    totalIssues: number;
    doneIssues: number;
  } | null;
}

export async function getProjectDashboard(id: string): Promise<ProjectDashboard> {
  const { data } = await api.get<ProjectDashboard>(`/projects/${id}/dashboard`);
  return data;
}
