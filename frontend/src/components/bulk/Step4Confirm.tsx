/**
 * TTBULK-1 PR-9b → follow-up — Step 4 wizard: подтверждение и submit.
 *
 * Рендерит summary (operation + scope + count eligible) + для DELETE —
 * confirm-phrase gate (текст "DELETE" должен быть введён дословно). Submit
 * button → родитель вызывает `bulkOperationsApi.create`.
 *
 * Follow-up to PR-9b: UUID'ы в payload resolve'ятся в имена пользователей,
 * названия спринтов/статусов/кастом-полей через те же API что и Step2Configure.
 * API-вызовы дешёвые (listUsers/listAllSprints ~однажды на сессию).
 *
 * См. docs/tz/TTBULK-1.md §3.2 (R11-confirmation), §13.6 PR-9.
 */

import { useEffect, useState } from 'react';
import { Alert, Input, Space, Tag, Typography } from 'antd';
import type {
  BulkOperationPayload,
  BulkOperationType,
  BulkPreviewResponse,
  BulkScope,
} from '../../types/bulk.types';
import { OPERATION_LABELS } from '../../types/bulk.types';
import { listUsers } from '../../api/auth';
import type { User } from '../../types';
import { listAllSprints } from '../../api/sprints';
import type { Sprint } from '../../types/sprint.types';
import { workflowEngineApi, type BatchTransitionsItem } from '../../api/workflow-engine';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../../api/issue-custom-fields';

const { Text } = Typography;

export interface Step4ConfirmProps {
  operationType: BulkOperationType;
  payload: BulkOperationPayload | null;
  scope: BulkScope;
  preview: BulkPreviewResponse | null;
  /** Пользовательский ввод confirm-phrase (только для DELETE). */
  confirmPhrase: string;
  onConfirmPhraseChange: (v: string) => void;
}

export default function Step4Confirm({
  operationType,
  payload,
  scope,
  preview,
  confirmPhrase,
  onConfirmPhraseChange,
}: Step4ConfirmProps) {
  const eligibleCount = preview?.eligible.length ?? 0;
  const meta = OPERATION_LABELS[operationType];
  const destructive = meta.destructive === true;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Text type="secondary">Операция:</Text>
        <div>
          <Tag color={destructive ? 'red' : 'blue'}>{operationType}</Tag>
          <Text strong>{meta.label}</Text>
        </div>
      </div>

      <div>
        <Text type="secondary">Scope:</Text>
        <div>
          {scope.kind === 'ids' ? (
            <Text>IDs × {scope.issueIds.length}</Text>
          ) : (
            <Text code>{scope.jql}</Text>
          )}
        </div>
      </div>

      <div>
        <Text type="secondary">Будет применено к:</Text>
        <div>
          <Text strong style={{ fontSize: 18 }}>
            {eligibleCount}
          </Text>{' '}
          <Text type="secondary">eligible задач</Text>
          {preview && preview.conflicts.length > 0 && (
            <Text type="danger" style={{ marginLeft: 8 }}>
              ({preview.conflicts.length} conflicts будут исключены)
            </Text>
          )}
        </div>
      </div>

      <PayloadSummary payload={payload} scope={scope} />

      {destructive && (
        <Alert
          type="error"
          showIcon
          message="Подтвердите удаление"
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>
                Введите <Text code>DELETE</Text> (заглавными буквами) для подтверждения.
                Удаление необратимо.
              </Text>
              <Input
                placeholder="DELETE"
                value={confirmPhrase}
                onChange={(e) => onConfirmPhraseChange(e.target.value)}
                autoComplete="off"
                status={confirmPhrase && confirmPhrase !== 'DELETE' ? 'error' : undefined}
              />
            </Space>
          }
        />
      )}
    </Space>
  );
}

function PayloadSummary({
  payload,
  scope,
}: {
  payload: BulkOperationPayload | null;
  scope: BulkScope;
}) {
  if (!payload) return null;

  let summary: React.ReactNode = null;
  switch (payload.type) {
    case 'ASSIGN':
      summary = payload.assigneeId ? (
        <AssigneeName userId={payload.assigneeId} />
      ) : (
        <Text>Снять исполнителя</Text>
      );
      break;
    case 'TRANSITION':
      summary = <TransitionName transitionId={payload.transitionId} scope={scope} />;
      break;
    case 'EDIT_FIELD':
      summary = (
        <Text>
          Поле <Text code>{payload.field}</Text> = {formatValue(payload.value)}
        </Text>
      );
      break;
    case 'EDIT_CUSTOM_FIELD':
      summary = (
        <CustomFieldSummary
          customFieldId={payload.customFieldId}
          value={payload.value}
          scope={scope}
        />
      );
      break;
    case 'MOVE_TO_SPRINT':
      summary = payload.sprintId ? (
        <SprintName sprintId={payload.sprintId} />
      ) : (
        <Text>Убрать из спринта</Text>
      );
      break;
    case 'ADD_COMMENT':
      summary = (
        <>
          <Text type="secondary">Комментарий:</Text>
          <div style={{ padding: 8, background: 'rgba(0,0,0,0.04)', borderRadius: 4, maxHeight: 120, overflow: 'auto' }}>
            <Text>{payload.body}</Text>
          </div>
        </>
      );
      break;
    case 'DELETE':
      return null;
  }

  return (
    <div>
      <Text type="secondary">Payload:</Text>
      <div style={{ marginTop: 4 }}>{summary}</div>
    </div>
  );
}

// ────── resolver-компоненты ──────────────────────────────────────────────────

function AssigneeName({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let cancelled = false;
    listUsers()
      .then((list) => {
        if (!cancelled) setUser(list.find((u) => u.id === userId) ?? null);
      })
      .catch(() => {
        /* silent — fallback на UUID */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return (
    <Text>
      Назначить: {user ? <Text strong>{user.name} ({user.email})</Text> : <Text code>{userId}</Text>}
    </Text>
  );
}

function SprintName({ sprintId }: { sprintId: string }) {
  const [sprint, setSprint] = useState<Sprint | null>(null);
  useEffect(() => {
    let cancelled = false;
    listAllSprints({ state: 'ALL' }, { limit: 500 })
      .then((res) => {
        if (cancelled) return;
        setSprint((res.data ?? []).find((s) => s.id === sprintId) ?? null);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, [sprintId]);
  return (
    <Text>
      Переместить в спринт:{' '}
      {sprint ? (
        <Text strong>
          {sprint.name}
          {sprint.project ? ` · ${sprint.project.name}` : ''}
        </Text>
      ) : (
        <Text code>{sprintId}</Text>
      )}
    </Text>
  );
}

function TransitionName({ transitionId, scope }: { transitionId: string; scope: BulkScope }) {
  const [statusName, setStatusName] = useState<string | null>(null);
  const scopeKey = scope.kind === 'ids' ? scope.issueIds.join(',') : scope.jql;
  useEffect(() => {
    if (scope.kind !== 'ids' || scope.issueIds.length === 0) return;
    let cancelled = false;
    workflowEngineApi
      .getBatchTransitions(scope.issueIds)
      .then((batch: BatchTransitionsItem[]) => {
        if (cancelled) return;
        // Step2 stores bestTransitionId из одной workflow-схемы. В multi-project
        // выборке другие issue'и могут иметь тот же toStatus.name, но другой UUID —
        // резолвим имя статуса через exact UUID match ИЛИ через любую задачу,
        // где stored UUID присутствует.
        for (const it of batch) {
          for (const t of it.transitions) {
            if (t.id === transitionId) {
              setStatusName(t.toStatus.name);
              return;
            }
          }
        }
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionId, scopeKey]);
  return (
    <Text>
      Перевести в статус:{' '}
      {statusName ? <Text strong>{statusName}</Text> : <Text code>{transitionId}</Text>}
    </Text>
  );
}

function CustomFieldSummary({
  customFieldId,
  value,
  scope,
}: {
  customFieldId: string;
  value: unknown;
  scope: BulkScope;
}) {
  const [field, setField] = useState<IssueCustomFieldValue | null>(null);
  const scopeKey = scope.kind === 'ids' ? scope.issueIds.join(',') : scope.jql;
  useEffect(() => {
    if (scope.kind !== 'ids' || scope.issueIds.length === 0) return;
    const firstId = scope.issueIds[0];
    if (!firstId) return;
    let cancelled = false;
    issueCustomFieldsApi
      .getFields(firstId)
      .then((res) => {
        if (cancelled) return;
        setField(res.fields.find((f) => f.customFieldId === customFieldId) ?? null);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFieldId, scopeKey]);
  return (
    <Text>
      Поле:{' '}
      {field ? (
        <Text strong>
          {field.name} <Text type="secondary">({field.fieldType})</Text>
        </Text>
      ) : (
        <Text code>{customFieldId}</Text>
      )}{' '}
      = {formatValue(value)}
    </Text>
  );
}

function formatValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <Text type="secondary">—</Text>;
  if (typeof v === 'string') return <Text code>{v}</Text>;
  if (typeof v === 'number' || typeof v === 'boolean') return <Text code>{String(v)}</Text>;
  if (Array.isArray(v)) return <Text code>[{v.map(String).join(', ')}]</Text>;
  return <Text code>{JSON.stringify(v)}</Text>;
}
