/**
 * TTBULK-1 PR-9b → follow-up — Step 2 wizard: per-type конфигурация операции
 * через **человеко-понятные пикеры** вместо ввода UUID.
 *
 * Rich pickers:
 *   • TRANSITION       — Select целевого статуса, агрегированного из
 *                        `getBatchTransitions(ids)` по `toStatus.name`.
 *   • ASSIGN           — searchable Select пользователей (`listUsers()`).
 *   • EDIT_CUSTOM_FIELD — Select кастом-полей + типизированный value-input
 *                        (берём схему из первой выбранной задачи).
 *   • MOVE_TO_SPRINT   — Select спринтов, сгруппированных по проекту
 *                        (`listAllSprints({ state: 'ALL' })`).
 *
 * Инварианты:
 *   • Скоуп `'jql'` в UI пока не используется (только `'ids'` из BulkActionsBar),
 *     но fallback на ручной UUID-ввод сохранён как safety net для будущих
 *     callers.
 *   • Для multi-project выборки показываем tooltip/hint «доступно для N/M задач».
 *   • На API-ошибке — красный Alert + fallback UUID input.
 *
 * См. docs/tz/TTBULK-1.md §3.2, §13.6 PR-9.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Form, Input, Select, DatePicker, Radio, Space, Alert, Spin, Tooltip, InputNumber } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  BulkOperationType,
  BulkOperationPayload,
  BulkScope,
  EditFieldName,
} from '../../types/bulk.types';
import { workflowEngineApi, type BatchTransitionsItem } from '../../api/workflow-engine';
import { listUsers } from '../../api/auth';
import type { User } from '../../types';
import { listAllSprints } from '../../api/sprints';
import type { Sprint, SprintState } from '../../types/sprint.types';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../../api/issue-custom-fields';
import type { CustomFieldOption, ReferenceOptions } from '../../api/custom-fields';

export interface Step2ConfigureProps {
  operationType: BulkOperationType;
  /** Частичный payload (пользователь печатает). Родитель валидирует и хранит. */
  value: Partial<BulkOperationPayload> | null;
  onChange: (value: Partial<BulkOperationPayload>) => void;
  /** Скоуп из Wizard'а — нужен чтобы подгрузить контекстные справочники
   * (transitions для выбранных задач, custom fields из первой задачи). */
  scope: BulkScope;
}

const PRIORITIES = ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'] as const;
const EDIT_FIELDS: readonly { value: EditFieldName; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'labels.add', label: 'Labels — добавить' },
  { value: 'labels.remove', label: 'Labels — удалить' },
  { value: 'description.append', label: 'Description — append' },
];

const SPRINT_STATE_LABEL: Record<SprintState, string> = {
  PLANNED: 'Планируется',
  ACTIVE: 'Активен',
  CLOSED: 'Завершён',
};

export default function Step2Configure({ operationType, value, onChange, scope }: Step2ConfigureProps) {
  switch (operationType) {
    case 'TRANSITION':
      return <TransitionConfig value={value} onChange={onChange} scope={scope} />;
    case 'ASSIGN':
      return <AssignConfig value={value} onChange={onChange} />;
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
    case 'EDIT_CUSTOM_FIELD':
      return <EditCustomFieldConfig value={value} onChange={onChange} scope={scope} />;
    case 'MOVE_TO_SPRINT':
      return <MoveToSprintConfig value={value} onChange={onChange} />;
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

// ────── TRANSITION ────────────────────────────────────────────────────────────

interface TransitionOptionGroup {
  /** Человекочитаемое имя целевого статуса. */
  toStatusName: string;
  /** Категория (например, `done` / `in-progress`) — для иконки/цвета в будущем. */
  category: string;
  /** Сколько задач могут перейти в этот статус (любым из transitionId'ов). */
  totalIssues: number;
  /** `transitionId` с максимальным покрытием + его count — отправляется в payload.
   * Остальные задачи с другим transitionId'ом будут SKIPPED (NO_TRANSITION). */
  bestTransitionId: string;
  bestCount: number;
  /** Хотя бы один переход требует screen fields — флаг для user-facing warning. */
  requiresScreen: boolean;
}

function TransitionConfig({
  value,
  onChange,
  scope,
}: {
  value: Partial<BulkOperationPayload> | null;
  onChange: (v: Partial<BulkOperationPayload>) => void;
  scope: BulkScope;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchTransitionsItem[] | null>(null);

  const scopeKey = scope.kind === 'ids' ? scope.issueIds.join(',') : scope.jql;

  useEffect(() => {
    setError(null);
    if (scope.kind !== 'ids') {
      setLoading(false);
      return;
    }
    const ids = scope.issueIds;
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    workflowEngineApi
      .getBatchTransitions(ids)
      .then((res) => {
        if (!cancelled) setBatch(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e as { response?: { data?: { error?: string } } };
        setError(err?.response?.data?.error ?? 'Не удалось загрузить доступные переходы');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // scopeKey — стабильный derived string; [scope] ломался бы при reference-unstable callers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const groups = useMemo<TransitionOptionGroup[]>(() => {
    if (!batch) return [];
    // Двойной индекс: по имени статуса (для группировки в UI) и внутри —
    // счётчик по exactId. Нужно чтобы выбрать UUID с максимальным покрытием:
    // backend-executor матчит exact transitionId → issues с другим UUID будут
    // SKIPPED (NO_TRANSITION).
    const byStatus = new Map<
      string,
      { name: string; category: string; totalIssues: number; idCounts: Map<string, number>; requiresScreen: boolean }
    >();
    for (const item of batch) {
      // Дедупликация статусов внутри одной задачи — одна задача может иметь
      // несколько переходов в один и тот же статус (редко, но теоретически).
      const seenStatusInItem = new Set<string>();
      for (const t of item.transitions) {
        const key = t.toStatus.name;
        const bucket = byStatus.get(key) ?? {
          name: t.toStatus.name,
          category: t.toStatus.category,
          totalIssues: 0,
          idCounts: new Map<string, number>(),
          requiresScreen: false,
        };
        if (!seenStatusInItem.has(key)) {
          bucket.totalIssues += 1;
          seenStatusInItem.add(key);
        }
        bucket.idCounts.set(t.id, (bucket.idCounts.get(t.id) ?? 0) + 1);
        if (t.requiresScreen) bucket.requiresScreen = true;
        byStatus.set(key, bucket);
      }
    }
    const result: TransitionOptionGroup[] = [];
    for (const bucket of byStatus.values()) {
      let bestId = '';
      let bestCount = 0;
      for (const [id, count] of bucket.idCounts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestId = id;
        }
      }
      result.push({
        toStatusName: bucket.name,
        category: bucket.category,
        totalIssues: bucket.totalIssues,
        bestTransitionId: bestId,
        bestCount,
        requiresScreen: bucket.requiresScreen,
      });
    }
    return result.sort((a, b) => b.bestCount - a.bestCount);
  }, [batch]);

  // Для scope='jql' (пока не в UI) — fallback ввод UUID.
  if (scope.kind === 'jql') {
    return (
      <Form layout="vertical">
        <Alert
          type="info"
          showIcon
          message="JQL-скоуп: укажите transition ID вручную"
          description="Для JQL-выборки список переходов заранее неизвестен. Введите UUID перехода — executor пропустит задачи, где он недоступен."
          style={{ marginBottom: 16 }}
        />
        <Form.Item label="Transition ID (UUID)" required>
          <Input
            placeholder="00000000-0000-0000-0000-000000000000"
            value={(value as { transitionId?: string })?.transitionId ?? ''}
            onChange={(e) => onChange({ type: 'TRANSITION', transitionId: e.target.value })}
          />
        </Form.Item>
      </Form>
    );
  }

  const selectedId = (value as { transitionId?: string })?.transitionId ?? '';
  const selectedGroup = groups.find((g) => g.bestTransitionId === selectedId);
  const totalBatch = batch?.length ?? 0;

  return (
    <Form layout="vertical">
      {loading && (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Spin tip="Загружаем доступные переходы…" />
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {!loading && !error && groups.length === 0 && batch !== null && (
        <Alert
          type="warning"
          showIcon
          message="Нет доступных переходов"
          description="Ни одна выбранная задача не допускает transition (нет прав или текущий статус терминальный)."
        />
      )}
      {!loading && groups.length > 0 && (
        <>
          <Form.Item label="Перевести в статус" required>
            <Select
              placeholder="Выберите целевой статус"
              value={selectedGroup?.toStatusName}
              onChange={(statusName: string) => {
                const g = groups.find((x) => x.toStatusName === statusName);
                if (!g) return;
                onChange({
                  type: 'TRANSITION',
                  transitionId: g.bestTransitionId,
                });
              }}
              options={groups.map((g) => ({
                value: g.toStatusName,
                label: `${g.toStatusName} (доступно: ${g.bestCount}/${totalBatch})`,
              }))}
            />
          </Form.Item>
          {selectedGroup && selectedGroup.bestCount < totalBatch && (
            <Alert
              type="warning"
              showIcon
              message={`Переход применится к ${selectedGroup.bestCount} из ${totalBatch} задач`}
              description={
                selectedGroup.totalIssues > selectedGroup.bestCount
                  ? `Ещё ${selectedGroup.totalIssues - selectedGroup.bestCount} задач используют другой transition-UUID для того же статуса (разные workflow-схемы проектов) — они будут пропущены. Остальные ${totalBatch - selectedGroup.totalIssues} задач не допускают этот переход (NO_TRANSITION).`
                  : 'Задачи без доступного перехода будут пропущены (NO_TRANSITION).'
              }
              style={{ marginBottom: 16 }}
            />
          )}
          {selectedGroup?.requiresScreen && (
            <Alert
              type="warning"
              showIcon
              message="Переход требует заполнения полей"
              description="Пропустятся задачи, где обязательные поля перехода не заполнены. Full field-overrides UI появится позже."
            />
          )}
        </>
      )}
    </Form>
  );
}

// ────── ASSIGN ────────────────────────────────────────────────────────────────

function AssignConfig({
  value,
  onChange,
}: {
  value: Partial<BulkOperationPayload> | null;
  onChange: (v: Partial<BulkOperationPayload>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listUsers()
      .then((res) => {
        if (!cancelled) setUsers(res);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить список пользователей');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = value as { assigneeId?: string | null } | null;
  const selected = current && 'assigneeId' in current
    ? (current.assigneeId === null ? '__unassign__' : current.assigneeId)
    : undefined;

  const options = useMemo(
    () => [
      { value: '__unassign__', label: '— Снять исполнителя —' },
      ...users
        .filter((u) => u.isActive)
        .map((u) => ({
          value: u.id,
          label: `${u.name} <${u.email}>`,
        })),
    ],
    [users],
  );

  return (
    <Form layout="vertical">
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form.Item label="Новый исполнитель" required>
        <Select
          showSearch
          loading={loading}
          placeholder="Начните печатать имя или email…"
          value={selected}
          optionFilterProp="label"
          filterOption={(input, option) =>
            (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
          }
          onChange={(v: string) => {
            onChange({
              type: 'ASSIGN',
              assigneeId: v === '__unassign__' ? null : v,
            });
          }}
          options={options}
          style={{ width: '100%' }}
        />
      </Form.Item>
    </Form>
  );
}

// ────── EDIT_CUSTOM_FIELD ─────────────────────────────────────────────────────

function EditCustomFieldConfig({
  value,
  onChange,
  scope,
}: {
  value: Partial<BulkOperationPayload> | null;
  onChange: (v: Partial<BulkOperationPayload>) => void;
  scope: BulkScope;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<IssueCustomFieldValue[] | null>(null);

  const scopeKey = scope.kind === 'ids' ? scope.issueIds.join(',') : scope.jql;

  useEffect(() => {
    setError(null);
    if (scope.kind !== 'ids') {
      setLoading(false);
      return;
    }
    const firstId = scope.issueIds[0];
    if (!firstId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    issueCustomFieldsApi
      .getFields(firstId)
      .then((res) => {
        if (!cancelled) setFields(res.fields);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить кастом-поля');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const v = value as { customFieldId?: string; value?: unknown } | null;

  if (scope.kind === 'jql') {
    // Fallback UUID input — JQL-скоуп не имеет sample issue.
    return (
      <Form layout="vertical">
        <Alert
          type="info"
          showIcon
          message="JQL-скоуп: укажите custom field ID вручную"
          style={{ marginBottom: 16 }}
        />
        <Form.Item label="Custom field ID (UUID)" required>
          <Input
            placeholder="00000000-0000-0000-0000-000000000000"
            value={v?.customFieldId ?? ''}
            onChange={(e) =>
              onChange({ type: 'EDIT_CUSTOM_FIELD', customFieldId: e.target.value, value: v?.value })
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
              const raw = e.target.value;
              let parsed: unknown = raw;
              try {
                parsed = JSON.parse(raw);
              } catch {
                /* leave as string */
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

  const selectedField = fields?.find((f) => f.customFieldId === v?.customFieldId);

  return (
    <Form layout="vertical">
      {loading && (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Spin tip="Загружаем кастом-поля первой задачи…" />
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {!loading && fields !== null && fields.length === 0 && (
        <Alert
          type="warning"
          showIcon
          message="У первой выбранной задачи нет кастом-полей"
          description="Схема first-issue определяет доступные поля. Если в выборке есть задачи с другой схемой, используйте JQL-скоуп (будет добавлен позже)."
        />
      )}
      {!loading && fields && fields.length > 0 && (
        <>
          <Form.Item label="Кастом-поле" required>
            <Select
              placeholder="Выберите поле"
              value={v?.customFieldId}
              onChange={(cfId: string) => {
                onChange({ type: 'EDIT_CUSTOM_FIELD', customFieldId: cfId, value: undefined });
              }}
              options={fields.map((f) => ({
                value: f.customFieldId,
                label: `${f.name} (${f.fieldType})`,
              }))}
            />
          </Form.Item>
          {selectedField && (
            <Form.Item label="Значение" required>
              {renderCustomFieldValueInput(selectedField, v?.value, (nv) =>
                onChange({
                  type: 'EDIT_CUSTOM_FIELD',
                  customFieldId: selectedField.customFieldId,
                  value: nv,
                }),
              )}
            </Form.Item>
          )}
          <Alert
            type="info"
            showIcon
            message="Задачи с другой схемой кастом-полей будут пропущены при выполнении."
          />
        </>
      )}
    </Form>
  );
}

// ────── MOVE_TO_SPRINT ────────────────────────────────────────────────────────

function MoveToSprintConfig({
  value,
  onChange,
}: {
  value: Partial<BulkOperationPayload> | null;
  onChange: (v: Partial<BulkOperationPayload>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAllSprints({ state: 'ALL' }, { limit: 500 })
      .then((res) => {
        if (!cancelled) setSprints(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить спринты');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = value as { sprintId?: string | null } | null;
  const selected = current && 'sprintId' in current
    ? (current.sprintId === null ? '__remove__' : current.sprintId)
    : undefined;

  // Группировка по проекту — useMemo'ится чтобы не пересоздавать на каждый
  // keystroke в `showSearch` (перестройка ~500 sprints на рендер).
  const groupedOptions = useMemo(() => {
    const byProject = new Map<string, Sprint[]>();
    for (const s of sprints) {
      const key = s.project?.name ?? s.projectId;
      const arr = byProject.get(key) ?? [];
      arr.push(s);
      byProject.set(key, arr);
    }
    const result: { label: string; options: { value: string; label: string }[] }[] = [];
    result.push({
      label: 'Специальные',
      options: [{ value: '__remove__', label: '— Убрать из спринта —' }],
    });
    for (const [projectName, projectSprints] of byProject.entries()) {
      result.push({
        label: projectName,
        options: projectSprints
          .sort((a, b) => stateOrder(a.state) - stateOrder(b.state))
          .map((s) => ({
            value: s.id,
            label: `${s.name} · ${SPRINT_STATE_LABEL[s.state]}`,
          })),
      });
    }
    return result;
  }, [sprints]);

  return (
    <Form layout="vertical">
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form.Item label="Целевой спринт" required>
        <Select
          showSearch
          loading={loading}
          placeholder="Начните печатать имя спринта или проекта…"
          value={selected}
          optionFilterProp="label"
          filterOption={(input, option) =>
            (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
          }
          onChange={(v: string) => {
            onChange({
              type: 'MOVE_TO_SPRINT',
              sprintId: v === '__remove__' ? null : v,
            });
          }}
          options={groupedOptions}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Alert
        type="info"
        showIcon
        message="Задачи из других проектов будут пропущены (нельзя переместить между проектами)."
      />
    </Form>
  );
}

function stateOrder(state: SprintState): number {
  if (state === 'ACTIVE') return 0;
  if (state === 'PLANNED') return 1;
  return 2;
}

// ────── helpers ──────────────────────────────────────────────────────────────

function renderEditFieldInput(
  field: EditFieldName,
  current: unknown,
  onChange: (v: unknown) => void,
): ReactElement {
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

/**
 * Рендер input'а под тип кастом-поля. Основные `fieldType` из Prisma:
 * TEXT/TEXTAREA → строка, NUMBER → число, DATE → ISO-дата, SELECT → выпадашка,
 * MULTI_SELECT → multi, USER/REFERENCE → fallback на строку (UUID/ключ).
 */
function renderCustomFieldValueInput(
  field: IssueCustomFieldValue,
  current: unknown,
  onChange: (v: unknown) => void,
): ReactElement {
  const ft = field.fieldType;

  if (ft === 'TEXT') {
    return (
      <Input
        value={typeof current === 'string' ? current : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (ft === 'TEXTAREA') {
    return (
      <Input.TextArea
        rows={3}
        value={typeof current === 'string' ? current : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (ft === 'NUMBER') {
    return (
      <InputNumber
        style={{ width: '100%' }}
        value={typeof current === 'number' ? current : undefined}
        onChange={(v) => onChange(v)}
      />
    );
  }
  if (ft === 'DATE') {
    return (
      <DatePicker
        style={{ width: '100%' }}
        value={typeof current === 'string' && current ? dayjs(current) : null}
        onChange={(d: Dayjs | null) => onChange(d ? d.format('YYYY-MM-DD') : null)}
      />
    );
  }
  if (ft === 'SELECT' || ft === 'MULTI_SELECT') {
    const opts = Array.isArray(field.options) ? (field.options as CustomFieldOption[]) : [];
    const options = opts.map((o) => ({ value: o.value, label: o.label ?? o.value }));
    if (ft === 'SELECT') {
      return (
        <Select
          allowClear
          style={{ width: '100%' }}
          value={typeof current === 'string' ? current : undefined}
          onChange={(v) => onChange(v ?? null)}
          options={options}
          placeholder="Выберите значение"
        />
      );
    }
    return (
      <Select
        mode="multiple"
        allowClear
        style={{ width: '100%' }}
        value={Array.isArray(current) ? (current as string[]) : []}
        onChange={(v) => onChange(v)}
        options={options}
        placeholder="Выберите значения"
      />
    );
  }
  if (ft === 'CHECKBOX') {
    return (
      <Radio.Group
        value={current}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: true, label: 'Да' },
          { value: false, label: 'Нет' },
        ]}
      />
    );
  }
  // REFERENCE / USER / URL / unknown — fallback на строковое значение с хинтом.
  const ref = field.options as ReferenceOptions | null;
  const hint = ref && 'entity' in ref ? `Введите ID ${ref.entity}` : 'Введите значение (строку или JSON)';
  return (
    <Tooltip title={hint}>
      <Input.TextArea
        rows={2}
        placeholder={hint}
        value={
          typeof current === 'string'
            ? current
            : current !== undefined && current !== null
              ? JSON.stringify(current)
              : ''
        }
        onChange={(e) => {
          const raw = e.target.value;
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* leave as string */
          }
          onChange(parsed);
        }}
      />
    </Tooltip>
  );
}
