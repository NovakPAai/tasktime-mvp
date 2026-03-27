import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Table, Select, Switch, InputNumber, message, Popconfirm, Typography, Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { transitionScreensApi, type TransitionScreen, type TransitionScreenItem, type ReplaceItemPayload } from '../../api/transition-screens';
import { customFieldsApi, type CustomField } from '../../api/custom-fields';

// ─── System fields definition (mirrors backend system-fields.ts) ─────────────

const SYSTEM_FIELDS = [
  { key: 'ASSIGNEE',            name: 'Исполнитель',      inputType: 'USER'     },
  { key: 'DUE_DATE',            name: 'Срок',              inputType: 'DATE'     },
  { key: 'ACCEPTANCE_CRITERIA', name: 'Критерии приёмки',  inputType: 'TEXTAREA' },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditableItem {
  /** Unique key in the list: `custom:{uuid}` or `system:{key}` */
  rowKey: string;
  customFieldId?: string;
  systemFieldKey?: string;
  name: string;
  fieldType: string;
  isSystem: boolean;
  isRequired: boolean;
  orderIndex: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminTransitionScreenEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<TransitionScreen | null>(null);
  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addKey, setAddKey] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, fields] = await Promise.all([
        transitionScreensApi.get(id),
        customFieldsApi.list(),
      ]);
      setScreen(s);
      setAllFields(fields);
      setItems(
        (s.items ?? []).map((item: TransitionScreenItem): EditableItem => {
          if (item.systemFieldKey) {
            const meta = SYSTEM_FIELDS.find(f => f.key === item.systemFieldKey);
            return {
              rowKey: `system:${item.systemFieldKey}`,
              systemFieldKey: item.systemFieldKey,
              name: meta?.name ?? item.systemFieldKey,
              fieldType: meta?.inputType ?? '',
              isSystem: true,
              isRequired: item.isRequired,
              orderIndex: item.orderIndex,
            };
          }
          return {
            rowKey: `custom:${item.customFieldId}`,
            customFieldId: item.customFieldId!,
            name: item.customField!.name,
            fieldType: item.customField!.fieldType,
            isSystem: false,
            isRequired: item.isRequired,
            orderIndex: item.orderIndex,
          };
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddField = () => {
    if (!addKey) return;
    if (items.some(i => i.rowKey === addKey)) {
      message.warning('Поле уже добавлено');
      return;
    }
    const maxOrder = items.reduce((max, i) => Math.max(max, i.orderIndex), -1);

    if (addKey.startsWith('system:')) {
      const sfKey = addKey.slice(7);
      const meta = SYSTEM_FIELDS.find(f => f.key === sfKey);
      if (!meta) return;
      setItems(prev => [...prev, {
        rowKey: addKey,
        systemFieldKey: sfKey,
        name: meta.name,
        fieldType: meta.inputType,
        isSystem: true,
        isRequired: false,
        orderIndex: maxOrder + 1,
      }]);
    } else {
      const cfId = addKey.slice(7); // `custom:{uuid}`
      const field = allFields.find(f => f.id === cfId);
      if (!field) return;
      setItems(prev => [...prev, {
        rowKey: addKey,
        customFieldId: field.id,
        name: field.name,
        fieldType: field.fieldType,
        isSystem: false,
        isRequired: false,
        orderIndex: maxOrder + 1,
      }]);
    }
    setAddKey(undefined);
  };

  const handleRemove = (rowKey: string) => {
    setItems(prev => prev.filter(i => i.rowKey !== rowKey));
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const payload: ReplaceItemPayload[] = items.map((item, idx) => {
        if (item.systemFieldKey) {
          return { systemFieldKey: item.systemFieldKey, isRequired: item.isRequired, orderIndex: idx };
        }
        return { customFieldId: item.customFieldId!, isRequired: item.isRequired, orderIndex: idx };
      });
      await transitionScreensApi.replaceItems(id, payload);
      message.success('Поля сохранены');
      load();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const addedRowKeys = new Set(items.map(i => i.rowKey));

  const selectOptions = [
    {
      label: 'Системные поля',
      options: SYSTEM_FIELDS
        .filter(f => !addedRowKeys.has(`system:${f.key}`))
        .map(f => ({ value: `system:${f.key}`, label: f.name })),
    },
    {
      label: 'Кастомные поля',
      options: allFields
        .filter(f => !addedRowKeys.has(`custom:${f.id}`))
        .map(f => ({ value: `custom:${f.id}`, label: `${f.name} (${f.fieldType})` })),
    },
  ];

  const columns: ColumnsType<EditableItem> = [
    { title: '#', dataIndex: 'orderIndex', width: 40 },
    {
      title: 'Поле',
      render: (_, item) => (
        <span>
          {item.name}
          {item.isSystem && (
            <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>система</Tag>
          )}
        </span>
      ),
    },
    {
      title: 'Тип',
      render: (_, item) => item.isSystem ? null : <code>{item.fieldType}</code>,
    },
    {
      title: 'Обязательное',
      render: (_, item) => (
        <Switch
          size="small"
          checked={item.isRequired}
          onChange={(val) => setItems(prev => prev.map(i => i.rowKey === item.rowKey ? { ...i, isRequired: val } : i))}
        />
      ),
    },
    {
      title: 'Порядок',
      render: (_, item) => (
        <InputNumber
          size="small"
          min={0}
          value={item.orderIndex}
          onChange={(val) => setItems(prev => prev.map(i => i.rowKey === item.rowKey ? { ...i, orderIndex: val ?? 0 } : i))}
          style={{ width: 70 }}
        />
      ),
    },
    {
      title: '',
      width: 60,
      render: (_, item) => (
        <Popconfirm title="Убрать поле?" onConfirm={() => handleRemove(item.rowKey)} okText="Убрать" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  if (loading || !screen) return <div style={{ padding: 24 }}>Загрузка...</div>;

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/transition-screens')}>
          Назад
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>{screen.name}</Typography.Title>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select
          placeholder="Добавить поле"
          value={addKey}
          onChange={setAddKey}
          options={selectOptions}
          style={{ width: 320 }}
          allowClear
          showSearch
          optionFilterProp="label"
        />
        <Button icon={<PlusOutlined />} onClick={handleAddField} disabled={!addKey}>
          Добавить
        </Button>
        <Button type="primary" onClick={handleSave} loading={saving} style={{ marginLeft: 'auto' }}>
          Сохранить
        </Button>
      </div>

      <Table
        rowKey="rowKey"
        dataSource={items}
        columns={columns}
        pagination={false}
        size="small"
      />
    </div>
  );
}
