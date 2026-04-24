/**
 * TTBULK-1 PR-9b — Step 4 wizard: подтверждение и submit.
 *
 * Рендерит summary (operation + scope + count eligible) + для DELETE —
 * confirm-phrase gate (текст "DELETE" должен быть введён дословно). Submit
 * button → родитель вызывает `bulkOperationsApi.create`.
 *
 * См. docs/tz/TTBULK-1.md §3.2 (R11-confirmation), §13.6 PR-9.
 */

import { Alert, Input, Space, Tag, Typography } from 'antd';
import type {
  BulkOperationPayload,
  BulkOperationType,
  BulkPreviewResponse,
  BulkScope,
} from '../../types/bulk.types';
import { OPERATION_LABELS } from '../../types/bulk.types';

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

      <PayloadSummary payload={payload} />

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

function PayloadSummary({ payload }: { payload: BulkOperationPayload | null }) {
  if (!payload) return null;

  let summary: React.ReactNode = null;
  switch (payload.type) {
    case 'ASSIGN':
      summary = payload.assigneeId ? (
        <Text>Assignee: <Text code>{payload.assigneeId}</Text></Text>
      ) : (
        <Text>Unassign (очистить исполнителя)</Text>
      );
      break;
    case 'TRANSITION':
      summary = <Text>Transition ID: <Text code>{payload.transitionId}</Text></Text>;
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
        <Text>
          Custom field <Text code>{payload.customFieldId}</Text> = {formatValue(payload.value)}
        </Text>
      );
      break;
    case 'MOVE_TO_SPRINT':
      summary = payload.sprintId ? (
        <Text>Sprint: <Text code>{payload.sprintId}</Text></Text>
      ) : (
        <Text>Remove from sprint</Text>
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
      return null; // summary не нужен для DELETE — всё в Alert ниже
  }

  return (
    <div>
      <Text type="secondary">Payload:</Text>
      <div style={{ marginTop: 4 }}>{summary}</div>
    </div>
  );
}

function formatValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <Text type="secondary">—</Text>;
  if (typeof v === 'string') return <Text code>{v}</Text>;
  if (typeof v === 'number' || typeof v === 'boolean') return <Text code>{String(v)}</Text>;
  if (Array.isArray(v)) return <Text code>[{v.map(String).join(', ')}]</Text>;
  return <Text code>{JSON.stringify(v)}</Text>;
}
