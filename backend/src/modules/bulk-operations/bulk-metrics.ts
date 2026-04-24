/**
 * TTBULK-1 PR-13 — Prometheus metrics для массовых операций.
 *
 * 5 метрик (§12 ТЗ):
 *   • `bulk_op_total{type,status}` — Counter, increment при finalize.
 *   • `bulk_op_duration_seconds{type}` — Histogram, startedAt→finishedAt секунд.
 *   • `bulk_op_items_total{status}` — Counter, increment per-item outcome.
 *   • `bulk_op_queued_depth` — Gauge, текущая длина Redis pending-queue
 *     (сумма по всем операциям QUEUED+RUNNING). Считается в processor tick'е.
 *   • `bulk_op_processor_ticks_total{result}` — Counter для tick outcomes
 *     (processed / idle / skipped-lock).
 *
 * Используются отдельный Registry (не default) чтобы `/metrics` endpoint
 * выдавал только наши метрики — без node-process/gc/etc. мусора.
 *
 * Эти метрики — pure-stateful counters/gauges; operation на них безопасна
 * (idempotent increments), никогда не бросает. Вызовы из hot-path — <1μs.
 *
 * См. docs/tz/TTBULK-1.md §12, §13.8 PR-13.
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';
import type { BulkOperationStatus, BulkOperationType } from '@prisma/client';

export const bulkOpsRegistry = new Registry();

export const bulkOpTotal = new Counter({
  name: 'bulk_op_total',
  help: 'Number of bulk operations finalized, by type and final status',
  labelNames: ['type', 'status'] as const,
  registers: [bulkOpsRegistry],
});

export const bulkOpDurationSeconds = new Histogram({
  name: 'bulk_op_duration_seconds',
  help: 'End-to-end duration (startedAt to finishedAt) of bulk operations',
  labelNames: ['type'] as const,
  // Buckets: 1s, 5s, 30s, 2m, 10m, 1h — covers small (10 items) до full (10k).
  buckets: [1, 5, 30, 120, 600, 3600],
  registers: [bulkOpsRegistry],
});

export const bulkOpItemsTotal = new Counter({
  name: 'bulk_op_items_total',
  help: 'Per-item outcome counter (SUCCEEDED/FAILED/SKIPPED)',
  labelNames: ['status'] as const,
  registers: [bulkOpsRegistry],
});

export const bulkOpQueuedDepth = new Gauge({
  name: 'bulk_op_queued_depth',
  help: 'Current count of QUEUED + RUNNING operations',
  registers: [bulkOpsRegistry],
});

export const bulkOpProcessorTicksTotal = new Counter({
  name: 'bulk_op_processor_ticks_total',
  help: 'Processor tick outcomes (processed / idle / skipped-lock)',
  labelNames: ['result'] as const,
  registers: [bulkOpsRegistry],
});

// ────── Helper wrappers (thin — callers import counters directly) ────────────

export function recordFinalize(
  type: BulkOperationType,
  status: BulkOperationStatus,
  durationSeconds: number | null,
): void {
  bulkOpTotal.inc({ type, status });
  if (durationSeconds !== null && durationSeconds >= 0) {
    bulkOpDurationSeconds.observe({ type }, durationSeconds);
  }
}

export function recordItems(counts: { succeeded: number; failed: number; skipped: number }): void {
  if (counts.succeeded > 0) bulkOpItemsTotal.inc({ status: 'SUCCEEDED' }, counts.succeeded);
  if (counts.failed > 0) bulkOpItemsTotal.inc({ status: 'FAILED' }, counts.failed);
  if (counts.skipped > 0) bulkOpItemsTotal.inc({ status: 'SKIPPED' }, counts.skipped);
}

export function recordTickResult(result: 'processed' | 'idle' | 'skipped-lock'): void {
  bulkOpProcessorTicksTotal.inc({ result });
}

export function setQueuedDepth(n: number): void {
  bulkOpQueuedDepth.set(n);
}

/** Serialize all registered metrics в Prometheus text format. */
export async function renderMetrics(): Promise<string> {
  return bulkOpsRegistry.metrics();
}

/** Content-type для HTTP response'а (requires ';' separator per Prom spec). */
export const METRICS_CONTENT_TYPE = bulkOpsRegistry.contentType;

/** @internal — для unit тестов (clear state между testами). */
export function __resetMetrics(): void {
  bulkOpsRegistry.resetMetrics();
}
