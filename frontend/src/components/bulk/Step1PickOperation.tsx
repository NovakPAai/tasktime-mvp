/**
 * TTBULK-1 PR-9a — Step 1 wizard'а: выбор типа операции.
 *
 * Рендер: список из 7 типов `BulkOperationType` с radio-выбором; destructive
 * (DELETE) помечена warning-badge'ом. Disabled опции — если operation не
 * входит в `allowedOperations` (переданный из BulkActionsBar через wizard).
 *
 * onSelect(type) → родитель (`BulkOperationWizardModal`) продвигает step → 2.
 *
 * См. docs/tz/TTBULK-1.md §3.2, §13.6 PR-9.
 */

import { Radio, Space, Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { BulkOperationType } from '../../types/bulk.types';
import { BULK_OPERATION_TYPES, OPERATION_LABELS } from '../../types/bulk.types';

export interface Step1PickOperationProps {
  value?: BulkOperationType;
  onSelect: (type: BulkOperationType) => void;
  /** Подмножество разрешённых операций (например, если в scope нет subtask'ов). */
  allowedOperations?: readonly BulkOperationType[];
}

export default function Step1PickOperation({
  value,
  onSelect,
  allowedOperations,
}: Step1PickOperationProps) {
  const allowed = new Set(allowedOperations ?? BULK_OPERATION_TYPES);

  return (
    <Radio.Group
      value={value}
      onChange={(e) => onSelect(e.target.value as BulkOperationType)}
      style={{ width: '100%' }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {BULK_OPERATION_TYPES.map((t) => {
          const meta = OPERATION_LABELS[t];
          const disabled = !allowed.has(t);
          return (
            <Radio
              key={t}
              value={t}
              disabled={disabled}
              style={{
                padding: '8px 12px',
                border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: 6,
                width: '100%',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <strong>{meta.label}</strong>
                {meta.destructive && (
                  <Tag color="red" icon={<WarningOutlined />} style={{ marginLeft: 4 }}>
                    Необратимо
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                {meta.description}
              </div>
            </Radio>
          );
        })}
      </Space>
    </Radio.Group>
  );
}
