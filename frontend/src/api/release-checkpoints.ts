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
