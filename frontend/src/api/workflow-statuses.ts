import api from './client';

export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface WorkflowStatus {
  id: string;
  name: string;
  description: string | null;
  category: StatusCategory;
  color: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { steps: number };
}

export const workflowStatusesApi = {
  list: () =>
    api.get<WorkflowStatus[]>('/admin/workflow-statuses').then(r => r.data),

  create: (data: { name: string; description?: string; category: StatusCategory; color?: string }) =>
    api.post<WorkflowStatus>('/admin/workflow-statuses', data).then(r => r.data),

  update: (id: string, data: { name?: string; description?: string; color?: string }) =>
    api.patch<WorkflowStatus>(`/admin/workflow-statuses/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/admin/workflow-statuses/${id}`).then(r => r.data),
};
