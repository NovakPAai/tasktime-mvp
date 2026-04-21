/**
 * TTSRH-1 PR-15 — unit tests для checkpoint.dto.ts superRefine cross-field
 * валидации (§5.12.3).
 *
 * Pure-unit — не требует Postgres. Регистрируется в `test:parser` скрипте.
 */
import { describe, expect, it } from 'vitest';

import {
  createCheckpointTypeDto,
  previewCheckpointConditionDto,
  updateCheckpointTypeDto,
} from '../src/modules/releases/checkpoints/checkpoint.dto.js';

const baseStructured = {
  name: 'Review deadline',
  offsetDays: -3,
  criteria: [{ type: 'STATUS_IN' as const, categories: ['DONE' as const] }],
};

describe('createCheckpointTypeDto — STRUCTURED mode (default)', () => {
  it('accepts structured-only payload without explicit conditionMode', () => {
    const res = createCheckpointTypeDto.safeParse(baseStructured);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.conditionMode).toBe('STRUCTURED');
  });

  it('rejects empty criteria[] in STRUCTURED', () => {
    const res = createCheckpointTypeDto.safeParse({ ...baseStructured, criteria: [] });
    expect(res.success).toBe(false);
  });

  it('rejects ttqlCondition in STRUCTURED', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      conditionMode: 'STRUCTURED',
      ttqlCondition: 'status = DONE',
    });
    expect(res.success).toBe(false);
  });

  it('accepts ttqlCondition: null explicitly in STRUCTURED', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      conditionMode: 'STRUCTURED',
      ttqlCondition: null,
    });
    expect(res.success).toBe(true);
  });
});

describe('createCheckpointTypeDto — TTQL mode', () => {
  it('accepts TTQL-only payload (criteria optional but may be empty)', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      criteria: [],
      conditionMode: 'TTQL',
      ttqlCondition: 'status = DONE AND assignee IS NOT EMPTY',
    });
    expect(res.success).toBe(true);
  });

  it('rejects empty ttqlCondition in TTQL', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      criteria: [],
      conditionMode: 'TTQL',
      ttqlCondition: '',
    });
    expect(res.success).toBe(false);
  });

  it('rejects whitespace-only ttqlCondition in TTQL', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      criteria: [],
      conditionMode: 'TTQL',
      ttqlCondition: '   \n\t   ',
    });
    expect(res.success).toBe(false);
  });

  it('rejects missing ttqlCondition in TTQL', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      criteria: [],
      conditionMode: 'TTQL',
    });
    expect(res.success).toBe(false);
  });
});

describe('createCheckpointTypeDto — COMBINED mode', () => {
  it('accepts payload with both criteria[] и ttqlCondition', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      conditionMode: 'COMBINED',
      ttqlCondition: 'priority = HIGH',
    });
    expect(res.success).toBe(true);
  });

  it('rejects empty criteria in COMBINED', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      criteria: [],
      conditionMode: 'COMBINED',
      ttqlCondition: 'priority = HIGH',
    });
    expect(res.success).toBe(false);
  });

  it('rejects empty ttqlCondition in COMBINED', () => {
    const res = createCheckpointTypeDto.safeParse({
      ...baseStructured,
      conditionMode: 'COMBINED',
      ttqlCondition: '',
    });
    expect(res.success).toBe(false);
  });
});

describe('updateCheckpointTypeDto — PATCH without conditionMode', () => {
  it('skips cross-field check when conditionMode is absent', () => {
    const res = updateCheckpointTypeDto.safeParse({ name: 'renamed' });
    expect(res.success).toBe(true);
  });

  it('accepts {ttqlCondition} without conditionMode — cross-field skipped (service enforces)', () => {
    // DTO-level passes because we don't know effective mode here. The service
    // layer re-checks against existing row (see checkpoint-types.service.ts
    // updateCheckpointType — effective-mode guard).
    const res = updateCheckpointTypeDto.safeParse({ ttqlCondition: 'status = DONE' });
    expect(res.success).toBe(true);
  });

  it('accepts {criteria} without conditionMode — same rationale', () => {
    const res = updateCheckpointTypeDto.safeParse({
      criteria: [{ type: 'ASSIGNEE_SET' as const }],
    });
    expect(res.success).toBe(true);
  });

  it('accepts TTQL mode-change with required ttqlCondition', () => {
    const res = updateCheckpointTypeDto.safeParse({
      conditionMode: 'TTQL',
      ttqlCondition: 'status = DONE',
    });
    expect(res.success).toBe(true);
  });

  it('rejects TTQL mode-change without ttqlCondition', () => {
    const res = updateCheckpointTypeDto.safeParse({ conditionMode: 'TTQL' });
    expect(res.success).toBe(false);
  });

  it('rejects STRUCTURED mode-change with ttqlCondition payload', () => {
    const res = updateCheckpointTypeDto.safeParse({
      conditionMode: 'STRUCTURED',
      ttqlCondition: 'status = OPEN',
    });
    expect(res.success).toBe(false);
  });
});

describe('previewCheckpointConditionDto — PR-17', () => {
  it('accepts minimal STRUCTURED payload', () => {
    const res = previewCheckpointConditionDto.safeParse({
      releaseId: '00000000-0000-0000-0000-000000000001',
      conditionMode: 'STRUCTURED',
      criteria: [{ type: 'ASSIGNEE_SET' as const }],
    });
    expect(res.success).toBe(true);
  });

  it('accepts TTQL payload without criteria', () => {
    const res = previewCheckpointConditionDto.safeParse({
      releaseId: '00000000-0000-0000-0000-000000000001',
      conditionMode: 'TTQL',
      ttqlCondition: 'status = DONE',
    });
    expect(res.success).toBe(true);
  });

  it('rejects non-uuid releaseId', () => {
    const res = previewCheckpointConditionDto.safeParse({
      releaseId: 'not-a-uuid',
      conditionMode: 'STRUCTURED',
      criteria: [{ type: 'ASSIGNEE_SET' as const }],
    });
    expect(res.success).toBe(false);
  });

  it('rejects ttqlCondition over 10K chars', () => {
    const res = previewCheckpointConditionDto.safeParse({
      releaseId: '00000000-0000-0000-0000-000000000001',
      conditionMode: 'TTQL',
      ttqlCondition: 'x'.repeat(10_001),
    });
    expect(res.success).toBe(false);
  });

  it('conditionMode defaults to STRUCTURED when absent', () => {
    const res = previewCheckpointConditionDto.safeParse({
      releaseId: '00000000-0000-0000-0000-000000000001',
      criteria: [{ type: 'ASSIGNEE_SET' as const }],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.conditionMode).toBe('STRUCTURED');
  });
});
