import api from './client';

export interface WorkflowStep {
  id: string;
  statusId: string;
  status: { id: string; name: string; category: string; color: string };
  isInitial: boolean;
  orderIndex: number;
}

export interface WorkflowTransition {
  id: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string;
  fromStatus: { id: string; name: string; color: string } | null;
  toStatus: { id: string; name: string; color: string };
  isGlobal: boolean;
  conditions: unknown;
  validators: unknown;
  postFunctions: unknown;
  screenId: string | null;
  screen: { id: string; name: string } | null;
  orderIndex: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  steps?: WorkflowStep[];
  transitions?: WorkflowTransition[];
  _count?: { steps: number; transitions: number };
}

export const workflowsApi = {
  list: () =>
    api.get<Workflow[]>('/admin/workflows').then(r => r.data),

  get: (id: string) =>
    api.get<Workflow>(`/admin/workflows/${id}`).then(r => r.data),

  create: (data: { name: string; description?: string }) =>
    api.post<Workflow>('/admin/workflows', data).then(r => r.data),

  update: (id: string, data: { name?: string; description?: string; isDefault?: boolean }) =>
    api.put<Workflow>(`/admin/workflows/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/admin/workflows/${id}`).then(r => r.data),

  copy: (id: string) =>
    api.post<Workflow>(`/admin/workflows/${id}/copy`).then(r => r.data),

  addStep: (id: string, data: { statusId: string; isInitial?: boolean; orderIndex?: number }) =>
    api.post<WorkflowStep>(`/admin/workflows/${id}/steps`, data).then(r => r.data),

  updateStep: (id: string, stepId: string, data: { isInitial?: boolean; orderIndex?: number }) =>
    api.patch<WorkflowStep>(`/admin/workflows/${id}/steps/${stepId}`, data).then(r => r.data),

  deleteStep: (id: string, stepId: string) =>
    api.delete(`/admin/workflows/${id}/steps/${stepId}`).then(r => r.data),

  addTransition: (id: string, data: {
    name: string;
    fromStatusId?: string | null;
    toStatusId: string;
    isGlobal?: boolean;
    conditions?: unknown;
    validators?: unknown;
    postFunctions?: unknown;
    screenId?: string | null;
  }) => api.post<WorkflowTransition>(`/admin/workflows/${id}/transitions`, data).then(r => r.data),

  updateTransition: (id: string, transitionId: string, data: {
    name?: string;
    isGlobal?: boolean;
    conditions?: unknown;
    validators?: unknown;
    postFunctions?: unknown;
    screenId?: string | null;
  }) => api.put<WorkflowTransition>(`/admin/workflows/${id}/transitions/${transitionId}`, data).then(r => r.data),

  deleteTransition: (id: string, transitionId: string) =>
    api.delete(`/admin/workflows/${id}/transitions/${transitionId}`).then(r => r.data),
};
