import api from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReleaseStatus {
  id: string;
  name: string;
  category: 'PLANNING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  color: string;
  description?: string | null;
  orderIndex: number;
}

export interface ReleaseWorkflowStep {
  id: string;
  workflowId: string;
  statusId: string;
  isInitial: boolean;
  orderIndex: number;
  positionX?: number | null;
  positionY?: number | null;
  status: ReleaseStatus;
}

export interface ReleaseWorkflowTransition {
  id: string;
  workflowId: string;
  name: string;
  fromStatusId: string;
  toStatusId: string;
  isGlobal: boolean;
  conditions: unknown[] | null;
  fromStatus: ReleaseStatus;
  toStatus: ReleaseStatus;
}

export interface ReleaseWorkflow {
  id: string;
  name: string;
  description?: string | null;
  releaseType: 'ATOMIC' | 'INTEGRATION' | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  steps: ReleaseWorkflowStep[];
  transitions: ReleaseWorkflowTransition[];
  _count: { releases: number };
}

export interface ValidationReport {
  isValid: boolean;
  errors: Array<{ type: string; message: string }>;
  warnings: Array<{ type: string; message: string; statusId?: string; statusName?: string }>;
}

// ─── Workflows CRUD ───────────────────────────────────────────────────────────

export async function listReleaseWorkflows(): Promise<ReleaseWorkflow[]> {
  const { data } = await api.get<ReleaseWorkflow[]>('/admin/release-workflows');
  return data;
}

export async function getReleaseWorkflow(id: string): Promise<ReleaseWorkflow> {
  const { data } = await api.get<ReleaseWorkflow>(`/admin/release-workflows/${id}`);
  return data;
}

export async function createReleaseWorkflow(body: {
  name: string;
  description?: string;
  releaseType?: 'ATOMIC' | 'INTEGRATION' | null;
  isDefault?: boolean;
  isActive?: boolean;
}): Promise<ReleaseWorkflow> {
  const { data } = await api.post<ReleaseWorkflow>('/admin/release-workflows', body);
  return data;
}

export async function updateReleaseWorkflow(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    releaseType?: 'ATOMIC' | 'INTEGRATION' | null;
    isDefault?: boolean;
    isActive?: boolean;
  },
): Promise<ReleaseWorkflow> {
  const { data } = await api.put<ReleaseWorkflow>(`/admin/release-workflows/${id}`, body);
  return data;
}

export async function deleteReleaseWorkflow(id: string): Promise<void> {
  await api.delete(`/admin/release-workflows/${id}`);
}

export async function validateReleaseWorkflow(id: string): Promise<ValidationReport> {
  const { data } = await api.get<ValidationReport>(`/admin/release-workflows/${id}/validate`);
  return data;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export async function addReleaseWorkflowStep(
  workflowId: string,
  body: { statusId: string; isInitial?: boolean; orderIndex?: number },
): Promise<ReleaseWorkflowStep> {
  const { data } = await api.post<ReleaseWorkflowStep>(
    `/admin/release-workflows/${workflowId}/steps`,
    body,
  );
  return data;
}

export async function updateReleaseWorkflowStep(
  workflowId: string,
  stepId: string,
  body: { isInitial?: boolean; orderIndex?: number; positionX?: number; positionY?: number },
): Promise<ReleaseWorkflowStep> {
  const { data } = await api.patch<ReleaseWorkflowStep>(
    `/admin/release-workflows/${workflowId}/steps/${stepId}`,
    body,
  );
  return data;
}

export async function deleteReleaseWorkflowStep(
  workflowId: string,
  stepId: string,
): Promise<void> {
  await api.delete(`/admin/release-workflows/${workflowId}/steps/${stepId}`);
}

// ─── Transitions ──────────────────────────────────────────────────────────────

export async function createReleaseWorkflowTransition(
  workflowId: string,
  body: {
    name: string;
    fromStatusId: string;
    toStatusId: string;
    isGlobal?: boolean;
    conditions?: unknown[] | null;
  },
): Promise<ReleaseWorkflowTransition> {
  const { data } = await api.post<ReleaseWorkflowTransition>(
    `/admin/release-workflows/${workflowId}/transitions`,
    body,
  );
  return data;
}

export async function updateReleaseWorkflowTransition(
  workflowId: string,
  transitionId: string,
  body: {
    name?: string;
    fromStatusId?: string;
    toStatusId?: string;
    isGlobal?: boolean;
    conditions?: unknown[] | null;
  },
): Promise<ReleaseWorkflowTransition> {
  const { data } = await api.put<ReleaseWorkflowTransition>(
    `/admin/release-workflows/${workflowId}/transitions/${transitionId}`,
    body,
  );
  return data;
}

export async function deleteReleaseWorkflowTransition(
  workflowId: string,
  transitionId: string,
): Promise<void> {
  await api.delete(`/admin/release-workflows/${workflowId}/transitions/${transitionId}`);
}

// ─── Release Statuses ─────────────────────────────────────────────────────────

export async function listReleaseStatuses(): Promise<ReleaseStatus[]> {
  const { data } = await api.get<ReleaseStatus[]>('/admin/release-statuses');
  return data;
}
