// TTMP-160 PR-5: CheckpointType admin API client.

import api from './client';

export type CheckpointWeight = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type CheckpointState = 'PENDING' | 'OK' | 'VIOLATED';
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type CheckpointCriterion =
  | { type: 'STATUS_IN'; categories: StatusCategory[]; issueTypes?: string[] }
  | { type: 'DUE_BEFORE'; days: number; issueTypes?: string[] }
  | { type: 'ASSIGNEE_SET'; issueTypes?: string[] }
  | {
      type: 'CUSTOM_FIELD_VALUE';
      customFieldId: string;
      operator: 'EQUALS' | 'NOT_EMPTY' | 'IN';
      value?: unknown;
      issueTypes?: string[];
    }
  | { type: 'ALL_SUBTASKS_DONE'; issueTypes?: string[] }
  | { type: 'NO_BLOCKING_LINKS'; linkTypeKeys?: string[]; issueTypes?: string[] };

export type CheckpointCriterionType = CheckpointCriterion['type'];

// TTSRH-1 PR-15: три режима оценки. STRUCTURED — existing (criteria[]),
// TTQL — evaluate через compiled TTS-QL, COMBINED — оба одновременно.
export type CheckpointConditionMode = 'STRUCTURED' | 'TTQL' | 'COMBINED';

export interface CheckpointType {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  weight: CheckpointWeight;
  offsetDays: number;
  warningDays: number;
  criteria: CheckpointCriterion[];
  conditionMode?: CheckpointConditionMode;
  ttqlCondition?: string | null;
  webhookUrl?: string | null;
  minStableSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { releaseCheckpoints: number; templateItems: number };
}

export interface CreateCheckpointTypeBody {
  name: string;
  description?: string | null;
  color: string;
  weight: CheckpointWeight;
  offsetDays: number;
  warningDays?: number;
  criteria: CheckpointCriterion[];
  conditionMode?: CheckpointConditionMode;
  ttqlCondition?: string | null;
  webhookUrl?: string | null;
  minStableSeconds?: number;
  isActive?: boolean;
}

export type UpdateCheckpointTypeBody = Partial<CreateCheckpointTypeBody>;

export async function listCheckpointTypes(filters?: { isActive?: boolean }): Promise<CheckpointType[]> {
  const params: Record<string, string> = {};
  if (filters?.isActive !== undefined) params.isActive = String(filters.isActive);
  const { data } = await api.get<CheckpointType[]>('/admin/checkpoint-types', { params });
  return data;
}

export async function getCheckpointType(id: string): Promise<CheckpointType> {
  const { data } = await api.get<CheckpointType>(`/admin/checkpoint-types/${id}`);
  return data;
}

export async function createCheckpointType(body: CreateCheckpointTypeBody): Promise<CheckpointType> {
  const { data } = await api.post<CheckpointType>('/admin/checkpoint-types', body);
  return data;
}

export async function updateCheckpointType(id: string, body: UpdateCheckpointTypeBody): Promise<CheckpointType> {
  const { data } = await api.patch<CheckpointType>(`/admin/checkpoint-types/${id}`, body);
  return data;
}

export async function deleteCheckpointType(id: string): Promise<void> {
  await api.delete(`/admin/checkpoint-types/${id}`);
}

export interface CheckpointTypeInstance {
  id: string;
  releaseId: string;
  releaseName: string;
  releasePlannedDate: string | null;
  projectKey: string | null;
  projectName: string | null;
  deadline: string;
  state: CheckpointState;
}

export async function listActiveInstances(id: string): Promise<CheckpointTypeInstance[]> {
  const { data } = await api.get<CheckpointTypeInstance[]>(
    `/admin/checkpoint-types/${id}/instances`,
  );
  return data;
}

export async function syncInstances(
  id: string,
  releaseIds: string[],
): Promise<{ syncedCount: number }> {
  const { data } = await api.post<{ syncedCount: number }>(
    `/admin/checkpoint-types/${id}/sync-instances`,
    { releaseIds },
  );
  return data;
}

// TTSRH-1 PR-17/18: dry-run preview для TTQL/STRUCTURED/COMBINED condition.
// Используется UI PR-18 в Preview-панели формы редактирования КТ.
export interface CheckpointPreviewBody {
  releaseId: string;
  conditionMode: CheckpointConditionMode;
  criteria?: CheckpointCriterion[];
  ttqlCondition?: string | null;
  offsetDays?: number;
  warningDays?: number;
}

export interface CheckpointPreviewResponse {
  state: 'PENDING' | 'OK' | 'VIOLATED' | 'ERROR';
  isWarning: boolean;
  applicableIssueIds: string[];
  passedIssueIds: string[];
  violations: Array<{
    issueId: string;
    issueKey: string;
    issueTitle: string;
    reason: string;
    criterionType: string;
  }>;
  violationsHash: string;
  breakdown: { applicable: number; passed: number; violated: number };
  meta: {
    releaseId: string;
    conditionMode: CheckpointConditionMode;
    totalIssuesInRelease: number;
    ttqlSkippedByFlag: boolean;
    ttqlError: string | null;
  };
}

export async function previewCheckpointCondition(
  body: CheckpointPreviewBody,
): Promise<CheckpointPreviewResponse> {
  const { data } = await api.post<CheckpointPreviewResponse>(
    '/admin/checkpoint-types/preview',
    body,
  );
  return data;
}
