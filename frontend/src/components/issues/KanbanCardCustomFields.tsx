import { Space, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import type { KanbanField } from '../../types';

function FieldValue({ field }: { field: KanbanField }) {
  const val = field.value;

  if (val === null || val === undefined || val === '') {
    return (
      <Typography.Text type="warning" style={{ fontSize: 11 }}>
        <WarningOutlined /> Не заполнено
      </Typography.Text>
    );
  }

  switch (field.fieldType) {
    case 'CHECKBOX':
      return (val as boolean)
        ? <CheckOutlined style={{ color: '#4caf7d', fontSize: 11 }} />
        : <CloseOutlined style={{ color: '#aaa', fontSize: 11 }} />;

    case 'SELECT':
      return <Tag style={{ fontSize: 11, margin: 0 }}>{String(val)}</Tag>;

    case 'MULTI_SELECT': {
      const arr = Array.isArray(val) ? val as string[] : [];
      return (
        <Space size={2}>
          {arr.slice(0, 2).map(v => <Tag key={v} style={{ fontSize: 11, margin: 0 }}>{v}</Tag>)}
          {arr.length > 2 && <Typography.Text type="secondary" style={{ fontSize: 11 }}>+{arr.length - 2}</Typography.Text>}
        </Space>
      );
    }

    case 'REFERENCE': {
      const arr = Array.isArray(val) ? val as string[] : [];
      return (
        <Space size={2}>
          {arr.slice(0, 2).map(v => <Tag key={v} style={{ fontSize: 11, margin: 0 }}>{v}</Tag>)}
          {arr.length > 2 && <Typography.Text type="secondary" style={{ fontSize: 11 }}>+{arr.length - 2}</Typography.Text>}
        </Space>
      );
    }

    case 'DATE': {
      const d = new Date(val as string);
      return (
        <Typography.Text style={{ fontSize: 11 }}>
          {isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </Typography.Text>
      );
    }

    case 'NUMBER':
    case 'DECIMAL':
      return <Typography.Text style={{ fontSize: 11 }}>{String(val)}</Typography.Text>;

    case 'USER':
      return <Typography.Text style={{ fontSize: 11 }}>{String(val)}</Typography.Text>;

    default: {
      const str = String(val);
      return (
        <Typography.Text style={{ fontSize: 11 }}>
          {str.length > 30 ? str.slice(0, 30) + '…' : str}
        </Typography.Text>
      );
    }
  }
}

interface Props {
  kanbanFields: KanbanField[];
}

export default function KanbanCardCustomFields({ kanbanFields }: Props) {
  if (!kanbanFields || kanbanFields.length === 0) return null;

  const visible = kanbanFields.slice(0, 3);

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {visible.map(field => (
        <div key={field.customFieldId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Typography.Text type="secondary" style={{ fontSize: 10, minWidth: 0, flexShrink: 0 }}>
            {field.name}:
          </Typography.Text>
          <FieldValue field={field} />
        </div>
      ))}
    </div>
  );
}
