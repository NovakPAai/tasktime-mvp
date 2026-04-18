// TTMP-160 PR-8 / FR-23: checkpoint-violation audit API client.

import api from './client';

export interface AuditEventRow {
  id: string;
  releaseCheckpointId: string;
  releaseId: string;
  releaseName: string;
  projectKey: string | null;
  projectName: string | null;
  checkpointName: string;
  issueId: string;
  issueKey: string;
  criterionType: string;
  reason: string;
  occurredAt: string;
  resolvedAt: string | null;
}

export interface AuditFilters {
  from?: string;
  to?: string;
  projectId?: string;
  releaseId?: string;
  checkpointTypeId?: string;
  onlyOpen?: boolean;
  limit?: number;
}

function toParams(filters: AuditFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.projectId) params.projectId = filters.projectId;
  if (filters.releaseId) params.releaseId = filters.releaseId;
  if (filters.checkpointTypeId) params.checkpointTypeId = filters.checkpointTypeId;
  if (filters.onlyOpen) params.onlyOpen = 'true';
  if (filters.limit) params.limit = String(filters.limit);
  return params;
}

export async function listAuditEvents(filters: AuditFilters = {}): Promise<AuditEventRow[]> {
  const { data } = await api.get<AuditEventRow[]>('/admin/checkpoint-audit', {
    params: toParams(filters),
  });
  return data;
}

/**
 * Download audit-events CSV. Returns a Blob the caller can hand to a `<a download>` link.
 */
export async function downloadAuditCsv(filters: AuditFilters = {}): Promise<Blob> {
  const res = await api.get<Blob>('/admin/checkpoint-audit/csv', {
    params: toParams(filters),
    responseType: 'blob',
  });
  return res.data;
}
