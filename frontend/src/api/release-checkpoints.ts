// TTMP-160 PR-6: release-scoped and issue-scoped checkpoint API client.

import api from './client';
import type {
  CheckpointCriterionType,
  CheckpointState,
  CheckpointWeight,
} from './release-checkpoint-types';

export type ReleaseRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ReleaseRisk {
  score: number;
  level: ReleaseRiskLevel;
}

export interface CheckpointBreakdown {
  applicable: number;
  passed: number;
  violated: number;
}

export interface ViolatedIssue {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  reason: string;
  criterionType: CheckpointCriterionType;
}

export interface PassedIssue {
  issueId: string;
  issueKey: string;
  issueTitle: string;
}

export interface EvaluatedCheckpoint {
  id: string;
  releaseId: string;
  checkpointType: {
    id: string;
    name: string;
    color: string;
    weight: CheckpointWeight;
  };
  deadline: string;
  state: CheckpointState;
  isWarning: boolean;
  breakdown: CheckpointBreakdown;
  passedIssues: PassedIssue[];
  violatedIssues: ViolatedIssue[];
  lastEvaluatedAt: string | null;
  offsetDaysSnapshot: number;
}

export interface ReleaseCheckpointsResponse {
  releaseId: string;
  risk: ReleaseRisk;
  checkpoints: EvaluatedCheckpoint[];
}

export interface CheckpointPreviewItem {
  checkpointTypeId: string;
  name: string;
  color: string;
  weight: CheckpointWeight;
  offsetDaysSnapshot: number;
  deadline: string;
  wouldBeState: CheckpointState;
  breakdown: CheckpointBreakdown;
  violations: ViolatedIssue[];
}

export interface IssueCheckpointsGroup {
  releaseId: string;
  releaseName: string;
  checkpoints: EvaluatedCheckpoint[];
}

export interface CheckpointViolationEvent {
  id: string;
  releaseCheckpointId: string;
  releaseId: string;
  issueId: string;
  issueKey: string;
  reason: string;
  criterionType: CheckpointCriterionType;
  occurredAt: string;
  resolvedAt: string | null;
  checkpointName: string;
  releaseName: string;
}

export async function getReleaseCheckpoints(
  releaseId: string,
): Promise<ReleaseCheckpointsResponse> {
  const { data } = await api.get<ReleaseCheckpointsResponse>(
    `/releases/${releaseId}/checkpoints`,
  );
  return data;
}

export async function previewTemplate(
  releaseId: string,
  templateId: string,
): Promise<{ previews: CheckpointPreviewItem[] }> {
  const { data } = await api.post<{ previews: CheckpointPreviewItem[] }>(
    `/releases/${releaseId}/checkpoints/preview-template`,
    { templateId },
  );
  return data;
}

export async function applyTemplate(
  releaseId: string,
  templateId: string,
): Promise<ReleaseCheckpointsResponse> {
  const { data } = await api.post<ReleaseCheckpointsResponse>(
    `/releases/${releaseId}/checkpoints/apply-template`,
    { templateId },
  );
  return data;
}

export async function addCheckpoints(
  releaseId: string,
  checkpointTypeIds: string[],
): Promise<ReleaseCheckpointsResponse> {
  const { data } = await api.post<ReleaseCheckpointsResponse>(
    `/releases/${releaseId}/checkpoints`,
    { checkpointTypeIds },
  );
  return data;
}

export async function recomputeRelease(
  releaseId: string,
): Promise<{ updatedCount: number; unchangedCount: number }> {
  const { data } = await api.post<{ updatedCount: number; unchangedCount: number }>(
    `/releases/${releaseId}/checkpoints/recompute`,
  );
  return data;
}

export async function deleteReleaseCheckpoint(
  releaseId: string,
  checkpointId: string,
): Promise<void> {
  await api.delete(`/releases/${releaseId}/checkpoints/${checkpointId}`);
}

export async function getIssueCheckpoints(
  issueId: string,
): Promise<IssueCheckpointsGroup[]> {
  const { data } = await api.get<IssueCheckpointsGroup[]>(
    `/issues/${issueId}/checkpoints`,
  );
  return data;
}

export async function getIssueCheckpointEvents(
  issueId: string,
): Promise<CheckpointViolationEvent[]> {
  const { data } = await api.get<CheckpointViolationEvent[]>(
    `/issues/${issueId}/checkpoint-events`,
  );
  return data;
}

// ─── FR-11 / FR-12: project- and user-scoped violation summaries ──────────────

export interface IssueViolationSummary {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  projectId: string;
  projectKey: string;
  violations: Array<{
    checkpointId: string;
    checkpointName: string;
    checkpointColor: string;
    releaseId: string;
    releaseName: string;
    deadline: string;
    reason: string;
  }>;
}

export async function getViolatingIssuesForProject(
  projectId: string,
): Promise<IssueViolationSummary[]> {
  const { data } = await api.get<IssueViolationSummary[]>(
    `/projects/${projectId}/checkpoint-violating-issues`,
  );
  return data;
}

export async function getMyCheckpointViolations(): Promise<IssueViolationSummary[]> {
  const { data } = await api.get<IssueViolationSummary[]>('/my-checkpoint-violations');
  return data;
}

export async function getMyCheckpointViolationsCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/my-checkpoint-violations/count');
  return data.count;
}

// ─── FR-26 / FR-27: release matrix ────────────────────────────────────────────

export type MatrixCellState = 'passed' | 'violated' | 'pending' | 'na';

export interface MatrixCell {
  state: MatrixCellState;
  reason?: string;
}

export interface CheckpointsMatrixResponse {
  releaseId: string;
  issues: Array<{ id: string; key: string; title: string }>;
  checkpoints: Array<{
    id: string;
    name: string;
    color: string;
    weight: string;
    deadline: string;
    state: CheckpointState;
  }>;
  // Row-major — cells[i][j] is issue i × checkpoint j.
  cells: MatrixCell[][];
}

export async function getCheckpointsMatrix(releaseId: string): Promise<CheckpointsMatrixResponse> {
  const { data } = await api.get<CheckpointsMatrixResponse>(
    `/releases/${releaseId}/checkpoints/matrix`,
  );
  return data;
}

export async function downloadCheckpointsMatrixCsv(releaseId: string): Promise<Blob> {
  const res = await api.get<Blob>(`/releases/${releaseId}/checkpoints/matrix`, {
    params: { format: 'csv' },
    responseType: 'blob',
  });
  return res.data;
}
