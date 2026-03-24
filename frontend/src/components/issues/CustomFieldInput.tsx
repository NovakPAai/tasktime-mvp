import { useState } from 'react';
import {
  Input,
  InputNumber,
  Select,
  Checkbox,
  Typography,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { IssueCustomFieldValue } from '../../api/issue-custom-fields';
import type { ReferenceOptions } from '../../api/custom-fields';

// DatePicker is loaded lazily via antd — import directly
import { DatePicker } from 'antd';

interface User {
  id: string;
  name: string;
}

interface Props {
  field: IssueCustomFieldValue;
  onSave: (value: unknown) => Promise<void>;
  allUsers?: User[];
  /** When true, always shows edit input (for create modal) */
  inlineEdit?: boolean;
}

function ReadValue({ field, allUsers = [] }: { field: IssueCustomFieldValue; allUsers?: User[] }) {
  const val = field.currentValue;

  if (val === null || val === undefined || val === '') {
    if (field.isRequired) {
      return (
        <Tooltip title="Обязательное поле">
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            <WarningOutlined /> Не заполнено
          </Typography.Text>
        </Tooltip>
      );
    }
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  switch (field.fieldType) {
    case 'CHECKBOX':
      return (val as boolean)
        ? <CheckOutlined style={{ color: '#4caf7d' }} />
        : <CloseOutlined style={{ color: '#aaa' }} />;

    case 'DATE': {
      const d = new Date(val as string);
      return <Typography.Text>{isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('ru-RU')}</Typography.Text>;
    }

    case 'DATETIME': {
      const d = new Date(val as string);
      return (
        <Typography.Text>
          {isNaN(d.getTime()) ? String(val) : d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
        </Typography.Text>
      );
    }

    case 'URL':
      return (
        <Typography.Link href={val as string} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
          {String(val).length > 40 ? String(val).slice(0, 40) + '…' : String(val)}
        </Typography.Link>
      );

    case 'SELECT': {
      const selectOpts = (Array.isArray(field.options) ? field.options : []) as { value: string; label: string; color?: string }[];
      const opt = selectOpts.find(o => o.value === val);
      return <Tag color={opt?.color !== 'default' ? opt?.color : undefined}>{opt?.label ?? String(val)}</Tag>;
    }

    case 'MULTI_SELECT': {
      const selectOpts = (Array.isArray(field.options) ? field.options : []) as { value: string; label: string; color?: string }[];
      const arr = Array.isArray(val) ? val as string[] : [];
      return (
        <Space size={2} wrap>
          {arr.map(v => {
            const opt = selectOpts.find(o => o.value === v);
            return <Tag key={v} color={opt?.color !== 'default' ? opt?.color : undefined}>{opt?.label ?? v}</Tag>;
          })}
        </Space>
      );
    }

    case 'USER': {
      const user = allUsers.find(u => u.id === val);
      return <Typography.Text>{user?.name ?? String(val)}</Typography.Text>;
    }

    case 'LABEL': {
      const arr = Array.isArray(val) ? val as string[] : [];
      return (
        <Space size={2} wrap>
          {arr.map(v => <Tag key={v}>{v}</Tag>)}
        </Space>
      );
    }

    case 'REFERENCE': {
      const refOpts = field.options as ReferenceOptions | null;
      const arr = Array.isArray(val) ? val as string[] : [];
      return (
        <Space size={2} wrap>
          {arr.map(v => {
            const item = refOpts?.items.find(i => i.value === v);
            return <Tag key={v}>{item?.label ?? v}</Tag>;
          })}
        </Space>
      );
    }

    case 'NUMBER':
    case 'DECIMAL':
      return <Typography.Text>{String(val)}</Typography.Text>;

    case 'TEXTAREA':
      return (
        <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {String(val).length > 120 ? String(val).slice(0, 120) + '…' : String(val)}
        </Typography.Text>
      );

    default:
      return <Typography.Text>{String(val)}</Typography.Text>;
  }
}

function EditInput({
  field,
  allUsers = [],
  onSave,
  onCancel,
  autoFocus = false,
}: {
  field: IssueCustomFieldValue;
  allUsers?: User[];
  onSave: (val: unknown) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [localVal, setLocalVal] = useState<unknown>(field.currentValue);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && field.fieldType !== 'TEXTAREA') { onSave(localVal); }
    if (e.key === 'Escape') { onCancel?.(); }
  };

  switch (field.fieldType) {
    case 'CHECKBOX':
      return (
        <Checkbox
          defaultChecked={field.currentValue as boolean ?? false}
          onChange={e => onSave(e.target.checked)}
        />
      );

    case 'SELECT': {
      const selectOpts = (Array.isArray(field.options) ? field.options : []) as { value: string; label: string }[];
      return (
        <Select
          autoFocus={autoFocus}
          defaultOpen={autoFocus}
          size="small"
          style={{ minWidth: 140 }}
          defaultValue={field.currentValue as string ?? undefined}
          allowClear
          onChange={v => onSave(v ?? null)}
          onBlur={() => onCancel?.()}
          options={selectOpts.map(o => ({ value: o.value, label: o.label }))}
        />
      );
    }

    case 'MULTI_SELECT': {
      const selectOpts = (Array.isArray(field.options) ? field.options : []) as { value: string; label: string }[];
      return (
        <Select
          autoFocus={autoFocus}
          mode="multiple"
          size="small"
          style={{ minWidth: 180 }}
          defaultValue={Array.isArray(field.currentValue) ? field.currentValue as string[] : []}
          onChange={v => setLocalVal(v)}
          onBlur={() => onSave(localVal)}
          options={selectOpts.map(o => ({ value: o.value, label: o.label }))}
        />
      );
    }

    case 'LABEL':
      return (
        <Select
          autoFocus={autoFocus}
          mode="tags"
          size="small"
          style={{ minWidth: 180 }}
          defaultValue={Array.isArray(field.currentValue) ? field.currentValue as string[] : []}
          onChange={v => setLocalVal(v)}
          onBlur={() => onSave(localVal)}
        />
      );

    case 'USER':
      return (
        <Select
          autoFocus={autoFocus}
          defaultOpen={autoFocus}
          size="small"
          style={{ minWidth: 140 }}
          defaultValue={field.currentValue as string ?? undefined}
          allowClear
          showSearch
          optionFilterProp="label"
          onChange={v => onSave(v ?? null)}
          onBlur={() => onCancel?.()}
          options={allUsers.map(u => ({ value: u.id, label: u.name }))}
        />
      );

    case 'NUMBER':
      return (
        <InputNumber
          autoFocus={autoFocus}
          size="small"
          precision={0}
          defaultValue={field.currentValue as number ?? undefined}
          onChange={v => setLocalVal(v)}
          onBlur={() => onSave(localVal)}
          onKeyDown={handleKeyDown}
          style={{ width: 120 }}
        />
      );

    case 'DECIMAL':
      return (
        <InputNumber
          autoFocus={autoFocus}
          size="small"
          defaultValue={field.currentValue as number ?? undefined}
          onChange={v => setLocalVal(v)}
          onBlur={() => onSave(localVal)}
          onKeyDown={handleKeyDown}
          style={{ width: 120 }}
        />
      );

    case 'DATE':
      return (
        <DatePicker
          autoFocus={autoFocus}
          size="small"
          defaultValue={field.currentValue ? dayjs(field.currentValue as string) : undefined}
          onChange={d => onSave(d ? d.format('YYYY-MM-DD') : null)}
          onBlur={() => !localVal && onCancel?.()}
          format="DD.MM.YYYY"
        />
      );

    case 'DATETIME':
      return (
        <DatePicker
          autoFocus={autoFocus}
          size="small"
          showTime
          defaultValue={field.currentValue ? dayjs(field.currentValue as string) : undefined}
          onChange={d => onSave(d ? d.toISOString() : null)}
          format="DD.MM.YYYY HH:mm"
        />
      );

    case 'TEXTAREA':
      return (
        <Input.TextArea
          autoFocus={autoFocus}
          size="small"
          autoSize={{ minRows: 2, maxRows: 6 }}
          defaultValue={field.currentValue as string ?? ''}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={() => onSave(localVal)}
          onKeyDown={handleKeyDown}
        />
      );

    case 'REFERENCE': {
      const refOpts = field.options as ReferenceOptions | null;
      const enabledItems = (refOpts?.items ?? []).filter(i => i.isEnabled);
      const maxValues = refOpts?.maxValues ?? 0;
      const isMultiple = maxValues !== 1;
      return (
        <Select
          autoFocus={autoFocus}
          defaultOpen={autoFocus}
          mode={isMultiple ? 'multiple' : undefined}
          maxCount={maxValues > 0 ? maxValues : undefined}
          size="small"
          style={{ minWidth: 180 }}
          defaultValue={isMultiple
            ? (Array.isArray(field.currentValue) ? field.currentValue as string[] : [])
            : (field.currentValue as string ?? undefined)
          }
          allowClear
          onChange={v => {
            if (isMultiple) {
              setLocalVal(v);
              // for multiple — save on blur
            } else {
              onSave(v ?? null);
            }
          }}
          onBlur={() => isMultiple && onSave(localVal)}
          options={enabledItems.map(i => ({ value: i.value, label: i.label }))}
        />
      );
    }

    default: // TEXT, URL
      return (
        <Input
          autoFocus={autoFocus}
          size="small"
          defaultValue={field.currentValue as string ?? ''}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={() => onSave(localVal)}
          onKeyDown={handleKeyDown}
        />
      );
  }
}

export default function CustomFieldInput({ field, onSave, allUsers = [], inlineEdit = true }: Props) {
  const [editing, setEditing] = useState(!inlineEdit);
  const [saving, setSaving] = useState(false);

  const handleSave = async (val: unknown) => {
    setSaving(true);
    try {
      await onSave(val);
    } finally {
      setSaving(false);
      if (inlineEdit) setEditing(false);
    }
  };

  // CHECKBOX is always interactive — no edit toggle needed
  if (field.fieldType === 'CHECKBOX') {
    return (
      <Checkbox
        checked={field.currentValue as boolean ?? false}
        disabled={saving}
        onChange={e => handleSave(e.target.checked)}
      />
    );
  }

  if (saving) return <Spin size="small" />;

  if (!inlineEdit || editing) {
    return (
      <EditInput
        field={field}
        allUsers={allUsers}
        onSave={handleSave}
        onCancel={() => inlineEdit && setEditing(false)}
        autoFocus={inlineEdit}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{ cursor: 'pointer', minHeight: 22, padding: '1px 4px', borderRadius: 4 }}
      className="tt-custom-field-read"
    >
      <ReadValue field={field} allUsers={allUsers} />
    </div>
  );
}
