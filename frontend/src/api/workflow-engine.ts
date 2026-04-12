import api from './client';

export interface WorkflowStatus {
  id: string;
  name: string;
  category: string;
  color: string;
}

export interface ScreenField {
  customFieldId?: string;
  systemFieldKey?: string;
  isSystemField: boolean;
  name: string;
  fieldType: string;
  isRequired: boolean;
  orderIndex: number;
  options?: unknown;
}

export interface TransitionOption {
  id: string;
  name: string;
  toStatus: WorkflowStatus;
  requiresScreen: boolean;
  screenFields: ScreenField[];
}

export interface AvailableTransitionsResponse {
  currentStatus: WorkflowStatus;
  transitions: TransitionOption[];
}

export interface BatchTransitionsItem {
  issueId: string;
  issueKey: string;
  title: string;
  currentStatus: WorkflowStatus | null;
  transitions: TransitionOption[];
}

export const workflowEngineApi = {
  getTransitions: (issueId: string) =>
    api.get<AvailableTransitionsResponse>(`/issues/${issueId}/transitions`).then(r => r.data),

  executeTransition: (issueId: string, data: { transitionId: string; screenFieldValues?: Record<string, unknown> }) =>
    api.post<{ id: string; status: string }>(`/issues/${issueId}/transitions`, data).then(r => r.data),

  getBatchTransitions: (issueIds: string[]) =>
    api.post<BatchTransitionsItem[]>('/issues/batch-transitions', { issueIds }).then(r => r.data),
};
