/**
 * TTBULK-1 PR-9a — typed API client для массовых операций.
 *
 * Публичный API (зеркалит backend router):
 *   • preview(input)         → POST /bulk-operations/preview
 *   • create(input)          → POST /bulk-operations
 *   • get(id)                → GET  /bulk-operations/:id
 *   • cancel(id)             → POST /bulk-operations/:id/cancel
 *   • listMine(query)        → GET  /bulk-operations
 *   • retryFailed(id, key)   → POST /bulk-operations/:id/retry-failed
 *   • downloadReport(id)     → GET  /bulk-operations/:id/report.csv (Blob)
 *   • streamUrl(id)          → URL для EventSource (PR-10 hook).
 *
 * Инварианты:
 *   • `idempotencyKey` — обязателен на create/retryFailed; поставщик (caller)
 *     должен генерить uuid v4 per user-action (wizard submit / retry button).
 *   • `downloadReport` возвращает Blob (не parse'ится как JSON) — caller должен
 *     использовать `saveBlob`. Response type = 'blob'.
 *
 * См. docs/tz/TTBULK-1.md §13.6 PR-9.
 */

import api from './client';
import type {
  BulkCreateResponse,
  BulkOperation,
  BulkOperationListResponse,
  BulkOperationPayload,
  BulkOperationStatus,
  BulkOperationType,
  BulkPreviewResponse,
  BulkScope,
} from '../types/bulk.types';

export interface PreviewInput {
  scope: BulkScope;
  payload: BulkOperationPayload;
}

export interface CreateInput {
  previewToken: string;
  idempotencyKey: string;
}

export interface ListQuery {
  limit?: number;
  startAt?: number;
  status?: BulkOperationStatus;
  type?: BulkOperationType;
}

export const bulkOperationsApi = {
  preview: (input: PreviewInput) =>
    api
      .post<BulkPreviewResponse>('/bulk-operations/preview', input)
      .then((r) => r.data),

  create: (input: CreateInput) =>
    api
      .post<BulkCreateResponse>('/bulk-operations', input, {
        // idempotencyKey goes в body — НЕ как header. Backend DTO ожидает его
        // в body (см. createBulkOperationDto: previewToken + idempotencyKey оба
        // в json). Header-based idempotency не реализован в PR-3.
      })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<BulkOperation>(`/bulk-operations/${id}`).then((r) => r.data),

  cancel: (id: string) =>
    api
      .post<BulkOperation>(`/bulk-operations/${id}/cancel`)
      .then((r) => r.data),

  listMine: (query?: ListQuery) =>
    api
      .get<BulkOperationListResponse>('/bulk-operations', { params: query })
      .then((r) => r.data),

  retryFailed: (id: string, idempotencyKey: string) =>
    api
      .post<BulkCreateResponse>(`/bulk-operations/${id}/retry-failed`, {
        idempotencyKey,
      })
      .then((r) => r.data),

  downloadReport: (id: string) =>
    api
      .get<Blob>(`/bulk-operations/${id}/report.csv`, { responseType: 'blob' })
      .then((r) => r.data),

  /**
   * Относительный URL для EventSource (native browser API не принимает
   * Authorization header — в PR-10 hook добавит polling fallback).
   */
  streamUrl: (id: string) => `/api/bulk-operations/${id}/stream`,
};
