/**
 * TTBULK-1 PR-9b — Step 2 wizard: per-type конфигурация операции.
 *
 * Формы для каждого типа (TRANSITION/ASSIGN/EDIT_FIELD/EDIT_CUSTOM_FIELD/
 * MOVE_TO_SPRINT/ADD_COMMENT/DELETE). DELETE — no config (только confirm).
 *
 * Scope PR-9b: **минимальные формы** с text/textarea/date/select. Rich selectors
 * (user-search, sprint-lookup, custom-field picker) не включены — user пастит UUID
 * напрямую (ID-first UX). Workflow-transition picker вынесен за scope (нужен
 * transitions-API; добавится в PR-12 с remaining polish).
 *
 * См. docs/tz/TTBULK-1.md §3.2, §13.6 PR-9.
 */

import { Form, Input, Select, DatePicker, Radio, Space, Alert } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  BulkOperationType,
  BulkOperationPayload,
  EditFieldName,
} from '../../types/bulk.types';

export interface Step2ConfigureProps {
  operationType: BulkOperationType;
  /** Частичный payload (пользователь печатает). Родитель валидирует и хранит. */
  value: Partial<BulkOperationPayload> | null;
  onChange: (value: Partial<BulkOperationPayload>) => void;
}

const PRIORITIES = ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'] as const;
const EDIT_FIELDS: readonly { value: EditFieldName; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'labels.add', label: 'Labels — добавить' },
  { value: 'labels.remove', label: 'Labels — удалить' },
  { value: 'description.append', label: 'Description — append' },
];

export default function Step2Configure({ operationType, value, onChange }: Step2ConfigureProps) {
  switch (operationType) {
    case 'TRANSITION':
      return (
        <Form layout="vertical">
          <Alert
            type="info"
            showIcon
            message="TRANSITION требует transitionId (UUID из workflow-схемы проекта)"
            description="Rich picker появится в PR-12 cutover polish. Сейчас — вставьте UUID."
            style={{ marginBottom: 16 }}
          />
          <Form.Item label="Transition ID (UUID)" required>
            <Input
              placeholder="00000000-0000-0000-0000-000000000000"
              value={(value as { transitionId?: string })?.transitionId ?? ''}
              onChange={(e) =>
                onChange({ type: 'TRANSITION', transitionId: e.target.value })
              }
            />
          </Form.Item>
        </Form>
      );

    case 'ASSIGN':
      return (
        <Form layout="vertical">
          <Form.Item label="Assignee User ID (UUID, пусто = unassign)">
            <Input
              placeholder="00000000-0000-0000-0000-000000000000"
              value={(value as { assigneeId?: string | null })?.assigneeId ?? ''}
              onChange={(e) =>
                onChange({
                  type: 'ASSIGN',
                  assigneeId: e.target.value.trim() === '' ? null : e.target.value,
                })
              }
            />
          </Form.Item>
        </Form>
      );

    case 'EDIT_FIELD': {
      const v = value as { field?: EditFieldName; value?: unknown } | null;
      const field = v?.field;
      return (
        <Form layout="vertical">
          <Form.Item label="Поле" required>
            <Select
              value={field}
              onChange={(f: EditFieldName) =>
                onChange({ type: 'EDIT_FIELD', field: f, value: undefined })
              }
              options={EDIT_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
              placeholder="Выберите поле"
            />
          </Form.Item>
          {field && (
            <Form.Item label="Значение" required>
              {renderEditFieldInput(field, v?.value, (nv) =>
                onChange({ type: 'EDIT_FIELD', field, value: nv }),
              )}
            </Form.Item>
          )}
        </Form>
      );
    }

    case 'EDIT_CUSTOM_FIELD': {
      const v = value as { customFieldId?: string; value?: unknown } | null;
      return (
        <Form layout="vertical">
          <Form.Item label="Custom field ID (UUID)" required>
            <Input
              placeholder="00000000-0000-0000-0000-000000000000"
              value={v?.customFieldId ?? ''}
              onChange={(e) =>
                onChange({
                  type: 'EDIT_CUSTOM_FIELD',
                  customFieldId: e.target.value,
                  value: v?.value,
                })
              }
            />
          </Form.Item>
          <Form.Item label="Значение (строка / число / JSON)">
            <Input.TextArea
              rows={3}
              placeholder='"my text" или 42 или {"key": "value"}'
              value={
                typeof v?.value === 'string'
                  ? v.value
                  : v?.value !== undefined
                    ? JSON.stringify(v.value)
                    : ''
              }
              onChange={(e) => {
                // Try parse as JSON, fall back to raw string.
                const raw = e.target.value;
                let parsed: unknown = raw;
                try {
                  parsed = JSON.parse(raw);
                } catch {
                  // leave as string
                }
                onChange({
                  type: 'EDIT_CUSTOM_FIELD',
                  customFieldId: v?.customFieldId ?? '',
                  value: parsed,
                });
              }}
            />
          </Form.Item>
        </Form>
      );
    }

    case 'MOVE_TO_SPRINT':
      return (
        <Form layout="vertical">
          <Form.Item label="Sprint ID (UUID, пусто = remove)">
            <Input
              placeholder="00000000-0000-0000-0000-000000000000"
              value={(value as { sprintId?: string | null })?.sprintId ?? ''}
              onChange={(e) =>
                onChange({
                  type: 'MOVE_TO_SPRINT',
                  sprintId: e.target.value.trim() === '' ? null : e.target.value,
                })
              }
            />
          </Form.Item>
        </Form>
      );

    case 'ADD_COMMENT':
      return (
        <Form layout="vertical">
          <Form.Item label="Текст комментария" required>
            <Input.TextArea
              rows={4}
              maxLength={10_000}
              showCount
              placeholder="Текст добавится к каждой задаче"
              value={(value as { body?: string })?.body ?? ''}
              onChange={(e) =>
                onChange({ type: 'ADD_COMMENT', body: e.target.value })
              }
            />
          </Form.Item>
        </Form>
      );

    case 'DELETE':
      return (
        <Alert
          type="warning"
          showIcon
          message="Удаление необратимо"
          description="Подтверждение «DELETE» запрашивается на Шаге 4. Дополнительной конфигурации не требуется."
        />
      );

    default:
      return null;
  }
}

// ────── helpers ──────────────────────────────────────────────────────────────

function renderEditFieldInput(
  field: EditFieldName,
  current: unknown,
  onChange: (v: unknown) => void,
): React.ReactElement {
  if (field === 'priority') {
    return (
      <Radio.Group
        value={current}
        onChange={(e) => onChange(e.target.value)}
        options={PRIORITIES.map((p) => ({ value: p, label: p }))}
      />
    );
  }
  if (field === 'dueDate') {
    return (
      <DatePicker
        style={{ width: '100%' }}
        value={typeof current === 'string' && current ? dayjs(current) : null}
        onChange={(d: Dayjs | null) =>
          onChange(d ? d.format('YYYY-MM-DD') : null)
        }
      />
    );
  }
  if (field === 'labels.add' || field === 'labels.remove') {
    return (
      <Select
        mode="tags"
        style={{ width: '100%' }}
        placeholder="Введите и Enter"
        value={Array.isArray(current) ? (current as string[]) : []}
        onChange={(v) => onChange(v)}
      />
    );
  }
  if (field === 'description.append') {
    return (
      <Input.TextArea
        rows={4}
        placeholder="Будет добавлено в конец description с переводом строки"
        value={typeof current === 'string' ? current : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <Space>Unsupported field</Space>;
}
