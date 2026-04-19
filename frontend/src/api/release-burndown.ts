// TTMP-160 PR-11: release burndown API client.
// Mirrors the `BurndownResponse` shape defined in `backend/src/modules/releases/
// checkpoints/burndown.service.ts`.

import api from './client';

export type BurndownMetric = 'issues' | 'hours' | 'violations';

export interface BurndownPoint {
  date: string;
  total: number;
  done: number;
  open: number;
  cancelled: number;
  totalEstimatedHours: number;
  doneEstimatedHours: number;
  openEstimatedHours: number;
  violatedCheckpoints: number;
  totalCheckpoints: number;
}

export interface IdealPoint {
  date: string;
  value: number;
}

export interface BurndownResponse {
  releaseId: string;
  metric: BurndownMetric;
  plannedDate: string | null;
  releaseDate: string | null;
  initial: BurndownPoint | null;
  series: BurndownPoint[];
  idealLine: IdealPoint[];
}

export interface BurndownQuery {
  metric?: BurndownMetric;
  from?: string;
  to?: string;
}

export async function getBurndown(
  releaseId: string,
  query: BurndownQuery = {},
): Promise<BurndownResponse> {
  const { data } = await api.get<BurndownResponse>(`/releases/${releaseId}/burndown`, {
    params: query,
  });
  return data;
}

export async function backfillBurndown(
  releaseId: string,
  date?: string,
): Promise<{ id: string; snapshotDate: string; capturedAt: string }> {
  const { data } = await api.post<{
    id: string;
    snapshotDate: string;
    capturedAt: string;
  }>(`/releases/${releaseId}/burndown/backfill`, date ? { date } : {});
  return data;
}
