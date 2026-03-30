import { Modal, Button, List, Typography, Space, Alert, Tag } from 'antd';
import { ExclamationCircleOutlined, WarningOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ConflictItem, ConflictCheckResult } from '../../api/field-schemas';

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  FIELD_DUPLICATE_SAME_SCOPE: 'Дублирование поля',
  REQUIRED_MISMATCH: 'Несоответствие «Обязательное»',
  KANBAN_OVERFLOW: 'Переполнение Kanban',
};

interface Props {
  open: boolean;
  schemaName: string;
  schemaId: string;
  result: ConflictCheckResult;
  onCancel: () => void;
  onPublishWithWarnings: () => void;
  publishing: boolean;
}

export default function SchemaConflictsModal({
  open,
  schemaName,
  schemaId,
  result,
  onCancel,
  onPublishWithWarnings,
  publishing,
}: Props) {
  const errors = result.conflicts.filter(c => c.severity === 'ERROR');
  const warnings = result.conflicts.filter(c => c.severity === 'WARNING');

  const downloadJson = () => {
    const now = new Date().toISOString().slice(0, 10);
    const filename = `conflicts-${schemaId.slice(0, 8)}-${now}.json`;
    const payload = {
      schemaId,
      schemaName,
      exportedAt: new Date().toISOString(),
      errors: errors.map(c => ({ ...c, severity: 'ERROR' })),
      warnings: warnings.map(c => ({ ...c, severity: 'WARNING' })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderConflict = (c: ConflictItem, idx: number) => (
    <List.Item key={idx}>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <Space>
          <Tag color={c.severity === 'ERROR' ? 'red' : 'orange'}>
            {CONFLICT_TYPE_LABELS[c.conflictType] ?? c.conflictType}
          </Tag>
          {c.customFieldName && (
            <Typography.Text strong>{c.customFieldName}</Typography.Text>
          )}
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {c.description}
        </Typography.Text>
        {c.conflictingSchemaName && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Конфликт со схемой: <strong>{c.conflictingSchemaName}</strong>
            {c.scopeType && ` (${c.scopeType})`}
          </Typography.Text>
        )}
      </Space>
    </List.Item>
  );

  const footer = (
    <Space>
      <Button icon={<DownloadOutlined />} onClick={downloadJson}>
        Скачать конфликты .json
      </Button>
      <Button onClick={onCancel}>Отмена</Button>
      {!result.hasErrors && (
        <Button
          type="primary"
          danger
          loading={publishing}
          onClick={onPublishWithWarnings}
          icon={<WarningOutlined />}
        >
          Опубликовать с предупреждениями
        </Button>
      )}
    </Space>
  );

  return (
    <Modal
      title="Конфликты при публикации схемы"
      open={open}
      onCancel={onCancel}
      footer={footer}
      width={600}
    >
      {result.hasErrors && (
        <Alert
          type="error"
          showIcon
          message="Публикация заблокирована"
          description="Исправьте ошибки перед публикацией схемы."
          style={{ marginBottom: 16 }}
        />
      )}

      {errors.length > 0 && (
        <>
          <Space style={{ marginBottom: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#e5534b' }} />
            <Typography.Text strong style={{ color: '#e5534b' }}>
              Ошибки ({errors.length})
            </Typography.Text>
          </Space>
          <List
            size="small"
            bordered
            dataSource={errors}
            renderItem={(c, i) => renderConflict(c, i)}
            style={{ marginBottom: 16 }}
          />
        </>
      )}

      {warnings.length > 0 && (
        <>
          <Space style={{ marginBottom: 8 }}>
            <WarningOutlined style={{ color: '#e8b84a' }} />
            <Typography.Text strong style={{ color: '#e8b84a' }}>
              Предупреждения ({warnings.length})
            </Typography.Text>
          </Space>
          <List
            size="small"
            bordered
            dataSource={warnings}
            renderItem={(c, i) => renderConflict(c, i)}
          />
        </>
      )}
    </Modal>
  );
}
