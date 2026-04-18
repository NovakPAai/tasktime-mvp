/**
 * TTMP-160 PR-1 — unit tests for Zod DTOs.
 * Exercises the discriminated criterion union and CRUD schemas without a DB.
 */
import { describe, it, expect } from 'vitest';
import {
  createCheckpointTypeDto,
  updateCheckpointTypeDto,
  createCheckpointTemplateDto,
  cloneCheckpointTemplateDto,
} from '../src/modules/releases/checkpoints/checkpoint.dto.js';

describe('createCheckpointTypeDto', () => {
  const base = {
    name: 'Code freeze',
    color: '#52C41A',
    weight: 'HIGH' as const,
    offsetDays: -7,
    warningDays: 2,
    criteria: [{ type: 'STATUS_IN' as const, categories: ['DONE' as const, 'IN_PROGRESS' as const] }],
  };

  it('accepts a valid payload and applies defaults', () => {
    const parsed = createCheckpointTypeDto.parse(base);
    expect(parsed.warningDays).toBe(2);
    expect(parsed.minStableSeconds).toBe(300);
    expect(parsed.isActive).toBe(true);
  });

  it('rejects non-hex color', () => {
    expect(() => createCheckpointTypeDto.parse({ ...base, color: 'green' })).toThrow();
  });

  it('rejects empty criteria', () => {
    expect(() => createCheckpointTypeDto.parse({ ...base, criteria: [] })).toThrow();
  });

  it('rejects offsetDays beyond ±365', () => {
    expect(() => createCheckpointTypeDto.parse({ ...base, offsetDays: 500 })).toThrow();
    expect(() => createCheckpointTypeDto.parse({ ...base, offsetDays: -500 })).toThrow();
  });

  it('accepts all six criterion types', () => {
    const uuid = '00000000-0000-0000-0000-000000000000';
    const criteria = [
      { type: 'STATUS_IN' as const, categories: ['DONE' as const] },
      { type: 'DUE_BEFORE' as const, days: 0 },
      { type: 'ASSIGNEE_SET' as const },
      { type: 'CUSTOM_FIELD_VALUE' as const, customFieldId: uuid, operator: 'NOT_EMPTY' as const },
      { type: 'ALL_SUBTASKS_DONE' as const },
      { type: 'NO_BLOCKING_LINKS' as const, linkTypeKeys: ['BLOCKS'] },
    ];
    const parsed = createCheckpointTypeDto.parse({ ...base, criteria });
    expect(parsed.criteria).toHaveLength(6);
  });

  it('rejects an unknown criterion.type', () => {
    expect(() =>
      createCheckpointTypeDto.parse({
        ...base,
        criteria: [{ type: 'UNKNOWN', foo: 'bar' } as unknown as (typeof base)['criteria'][number]],
      }),
    ).toThrow();
  });

  it('rejects CUSTOM_FIELD_VALUE without a UUID', () => {
    expect(() =>
      createCheckpointTypeDto.parse({
        ...base,
        criteria: [
          { type: 'CUSTOM_FIELD_VALUE' as const, customFieldId: 'not-a-uuid', operator: 'EQUALS' as const },
        ],
      }),
    ).toThrow();
  });

  it('rejects STATUS_IN with empty categories', () => {
    expect(() =>
      createCheckpointTypeDto.parse({
        ...base,
        criteria: [{ type: 'STATUS_IN' as const, categories: [] }],
      }),
    ).toThrow();
  });

  it('rejects webhookUrl that is not a URL', () => {
    expect(() =>
      createCheckpointTypeDto.parse({ ...base, webhookUrl: 'not-a-url' }),
    ).toThrow();
  });

  it('allows webhookUrl to be null', () => {
    const parsed = createCheckpointTypeDto.parse({ ...base, webhookUrl: null });
    expect(parsed.webhookUrl).toBeNull();
  });
});

describe('updateCheckpointTypeDto', () => {
  it('accepts an empty patch', () => {
    expect(updateCheckpointTypeDto.parse({})).toEqual({});
  });

  it('accepts a single-field patch', () => {
    const parsed = updateCheckpointTypeDto.parse({ name: 'Renamed' });
    expect(parsed.name).toBe('Renamed');
  });
});

describe('createCheckpointTemplateDto', () => {
  const typeId1 = '11111111-1111-1111-1111-111111111111';
  const typeId2 = '22222222-2222-2222-2222-222222222222';

  it('accepts a valid template with multiple items', () => {
    const parsed = createCheckpointTemplateDto.parse({
      name: 'Standard release',
      items: [
        { checkpointTypeId: typeId1, orderIndex: 0 },
        { checkpointTypeId: typeId2, orderIndex: 1 },
      ],
    });
    expect(parsed.items).toHaveLength(2);
  });

  it('rejects an empty items array', () => {
    expect(() =>
      createCheckpointTemplateDto.parse({ name: 'Empty', items: [] }),
    ).toThrow();
  });

  it('rejects duplicate checkpointTypeId in items', () => {
    expect(() =>
      createCheckpointTemplateDto.parse({
        name: 'Dup',
        items: [
          { checkpointTypeId: typeId1, orderIndex: 0 },
          { checkpointTypeId: typeId1, orderIndex: 1 },
        ],
      }),
    ).toThrow();
  });

  it('rejects non-UUID checkpointTypeId', () => {
    expect(() =>
      createCheckpointTemplateDto.parse({
        name: 'Bad',
        items: [{ checkpointTypeId: 'not-a-uuid', orderIndex: 0 }],
      }),
    ).toThrow();
  });
});

describe('cloneCheckpointTemplateDto', () => {
  it('accepts an empty body (name is optional)', () => {
    expect(cloneCheckpointTemplateDto.parse({})).toEqual({});
  });

  it('accepts a custom name', () => {
    const parsed = cloneCheckpointTemplateDto.parse({ name: 'My clone' });
    expect(parsed.name).toBe('My clone');
  });

  it('rejects an empty string name', () => {
    expect(() => cloneCheckpointTemplateDto.parse({ name: '' })).toThrow();
  });
});
