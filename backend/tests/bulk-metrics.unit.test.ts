/**
 * TTBULK-1 PR-13 — unit-тесты для bulk-metrics модуля.
 *
 * Проверяет: инкременты counter'ов, observe histogram'а, set gauge'а,
 * renderMetrics() формат Prometheus-text, resetMetrics() для cleanup.
 *
 * Pure-unit — prom-client работает in-process без external deps.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  recordFinalize,
  recordItems,
  recordTickResult,
  setQueuedDepth,
  renderMetrics,
  __resetMetrics,
} from '../src/modules/bulk-operations/bulk-metrics.js';

beforeEach(() => {
  __resetMetrics();
});

describe('recordFinalize', () => {
  it('инкрементит bulk_op_total с labels type+status', async () => {
    recordFinalize('ASSIGN', 'SUCCEEDED', 2.5);
    recordFinalize('ASSIGN', 'SUCCEEDED', 1.0);
    recordFinalize('DELETE', 'FAILED', null);

    const text = await renderMetrics();
    expect(text).toMatch(/bulk_op_total\{type="ASSIGN",status="SUCCEEDED"\}\s+2/);
    expect(text).toMatch(/bulk_op_total\{type="DELETE",status="FAILED"\}\s+1/);
  });

  it('observe histogram only when durationSeconds не null и >= 0', async () => {
    recordFinalize('ADD_COMMENT', 'SUCCEEDED', 3.0);
    recordFinalize('ADD_COMMENT', 'SUCCEEDED', null); // no observation
    recordFinalize('ADD_COMMENT', 'FAILED', -1); // negative — не записать

    const text = await renderMetrics();
    // Counter: 3 calls -> 3 total
    expect(text).toMatch(/bulk_op_total\{type="ADD_COMMENT",status="SUCCEEDED"\}\s+2/);
    expect(text).toMatch(/bulk_op_total\{type="ADD_COMMENT",status="FAILED"\}\s+1/);
    // Histogram sum: только 3.0 observation
    expect(text).toMatch(/bulk_op_duration_seconds_sum\{type="ADD_COMMENT"\}\s+3/);
    expect(text).toMatch(/bulk_op_duration_seconds_count\{type="ADD_COMMENT"\}\s+1/);
  });
});

describe('recordItems', () => {
  it('инкрементит bulk_op_items_total только для ненулевых counters', async () => {
    recordItems({ succeeded: 10, failed: 2, skipped: 0 });
    recordItems({ succeeded: 5, failed: 0, skipped: 3 });

    const text = await renderMetrics();
    expect(text).toMatch(/bulk_op_items_total\{status="SUCCEEDED"\}\s+15/);
    expect(text).toMatch(/bulk_op_items_total\{status="FAILED"\}\s+2/);
    expect(text).toMatch(/bulk_op_items_total\{status="SKIPPED"\}\s+3/);
  });

  it('all-zero counts — ничего не инкрементится', async () => {
    recordItems({ succeeded: 0, failed: 0, skipped: 0 });
    const text = await renderMetrics();
    // Counter без observations не появляется в output; проверяем что sum=0 отсутствует.
    expect(text).not.toMatch(/bulk_op_items_total\{/);
  });
});

describe('recordTickResult', () => {
  it('labels processed/idle/skipped-lock', async () => {
    recordTickResult('processed');
    recordTickResult('processed');
    recordTickResult('idle');
    recordTickResult('skipped-lock');

    const text = await renderMetrics();
    expect(text).toMatch(/bulk_op_processor_ticks_total\{result="processed"\}\s+2/);
    expect(text).toMatch(/bulk_op_processor_ticks_total\{result="idle"\}\s+1/);
    expect(text).toMatch(/bulk_op_processor_ticks_total\{result="skipped-lock"\}\s+1/);
  });
});

describe('setQueuedDepth', () => {
  it('gauge заменяет последнее значение (не аккумулирует)', async () => {
    setQueuedDepth(5);
    setQueuedDepth(10);
    setQueuedDepth(3);

    const text = await renderMetrics();
    expect(text).toMatch(/bulk_op_queued_depth\s+3/);
  });

  it('zero — тоже валидно', async () => {
    setQueuedDepth(7);
    setQueuedDepth(0);
    const text = await renderMetrics();
    expect(text).toMatch(/bulk_op_queued_depth\s+0/);
  });
});

describe('renderMetrics', () => {
  it('после observations — HELP/TYPE lines присутствуют', async () => {
    // prom-client v15 emit'ит HELP/TYPE только для метрик с observations.
    recordFinalize('ASSIGN', 'SUCCEEDED', 1.0);
    setQueuedDepth(0);
    recordItems({ succeeded: 1, failed: 0, skipped: 0 });
    recordTickResult('processed');

    const text = await renderMetrics();
    expect(text).toContain('# HELP bulk_op_total');
    expect(text).toContain('# TYPE bulk_op_total counter');
    expect(text).toContain('# HELP bulk_op_duration_seconds');
    expect(text).toContain('# TYPE bulk_op_duration_seconds histogram');
    expect(text).toContain('# HELP bulk_op_queued_depth');
    expect(text).toContain('# TYPE bulk_op_queued_depth gauge');
    expect(text).toContain('# HELP bulk_op_items_total');
    expect(text).toContain('# HELP bulk_op_processor_ticks_total');
  });

  it('вывод совместим с Prometheus format (newlines, labels)', async () => {
    recordFinalize('ASSIGN', 'SUCCEEDED', 1.0);
    setQueuedDepth(5);
    const text = await renderMetrics();
    // Prometheus text format: each line ends \n, labels в braces.
    expect(text.endsWith('\n')).toBe(true);
    // Labels должны быть в фигурных скобках.
    expect(text).toMatch(/bulk_op_total\{/);
  });
});
