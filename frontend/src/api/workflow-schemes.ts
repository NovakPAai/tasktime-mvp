import api from './client';

export interface WorkflowSchemeItem {
  id: string;
  issueTypeConfigId: string | null;
  workflowId: string;
  workflow: { id: string; name: string };
  issueTypeConfig: { id: string; name: string } | null;
}

export interface WorkflowSchemeProject {
  projectId: string;
  project: { id: string; name: string; key: string };
}

export interface WorkflowScheme {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  items?: WorkflowSchemeItem[];
  projects?: WorkflowSchemeProject[];
  _count?: { items: number; projects: number };
}

export const workflowSchemesApi = {
  list: () =>
    api.get<WorkflowScheme[]>('/admin/workflow-schemes').then(r => r.data),

  get: (id: string) =>
    api.get<WorkflowScheme>(`/admin/workflow-schemes/${id}`).then(r => r.data),

  create: (data: { name: string; description?: string; isDefault?: boolean }) =>
    api.post<WorkflowScheme>('/admin/workflow-schemes', data).then(r => r.data),

  update: (id: string, data: { name?: string; description?: string; isDefault?: boolean }) =>
    api.put<WorkflowScheme>(`/admin/workflow-schemes/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/admin/workflow-schemes/${id}`).then(r => r.data),

  updateItems: (id: string, items: { issueTypeConfigId: string | null; workflowId: string }[]) =>
    api.put<WorkflowScheme>(`/admin/workflow-schemes/${id}/items`, { items }).then(r => r.data),

  addProject: (id: string, projectId: string) =>
    api.post(`/admin/workflow-schemes/${id}/projects/${projectId}`).then(r => r.data),

  removeProject: (id: string, projectId: string) =>
    api.delete(`/admin/workflow-schemes/${id}/projects/${projectId}`).then(r => r.data),
};
