import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Table, Select, Switch, InputNumber, message, Popconfirm, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { transitionScreensApi, type TransitionScreen, type TransitionScreenItem } from '../../api/transition-screens';
import { customFieldsApi, type CustomField } from '../../api/custom-fields';

interface EditableItem {
  customFieldId: string;
  name: string;
  fieldType: string;
  isRequired: boolean;
  orderIndex: number;
}

export default function AdminTransitionScreenEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<TransitionScreen | null>(null);
  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addFieldId, setAddFieldId] = useState<string | undefined>();

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
        (s.items ?? []).map((item: TransitionScreenItem) => ({
          customFieldId: item.customFieldId,
          name: item.customField.name,
          fieldType: item.customField.fieldType,
          isRequired: item.isRequired,
          orderIndex: item.orderIndex,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddField = () => {
    if (!addFieldId) return;
    if (items.some(i => i.customFieldId === addFieldId)) {
      message.warning('Поле уже добавлено');
      return;
    }
    const field = allFields.find(f => f.id === addFieldId);
    if (!field) return;
    const maxOrder = items.reduce((max, i) => Math.max(max, i.orderIndex), -1);
    setItems(prev => [...prev, {
      customFieldId: field.id,
      name: field.name,
      fieldType: field.fieldType,
      isRequired: false,
      orderIndex: maxOrder + 1,
    }]);
    setAddFieldId(undefined);
  };

  const handleRemoveField = (customFieldId: string) => {
    setItems(prev => prev.filter(i => i.customFieldId !== customFieldId));
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await transitionScreensApi.replaceItems(id, items.map((item, idx) => ({
        customFieldId: item.customFieldId,
        isRequired: item.isRequired,
        orderIndex: idx,
      })));
      message.success('Поля сохранены');
      load();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<EditableItem> = [
    { title: '#', dataIndex: 'orderIndex', width: 40 },
    { title: 'Поле', dataIndex: 'name' },
    { title: 'Тип', dataIndex: 'fieldType', render: (v: string) => <code>{v}</code> },
    {
      title: 'Обязательное',
      render: (_, item) => (
        <Switch
          size="small"
          checked={item.isRequired}
          onChange={(val) => setItems(prev => prev.map(i => i.customFieldId === item.customFieldId ? { ...i, isRequired: val } : i))}
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
          onChange={(val) => setItems(prev => prev.map(i => i.customFieldId === item.customFieldId ? { ...i, orderIndex: val ?? 0 } : i))}
          style={{ width: 70 }}
        />
      ),
    },
    {
      title: '',
      width: 60,
      render: (_, item) => (
        <Popconfirm title="Убрать поле?" onConfirm={() => handleRemoveField(item.customFieldId)} okText="Убрать" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  if (loading || !screen) return <div style={{ padding: 24 }}>Загрузка...</div>;

  const addedFieldIds = new Set(items.map(i => i.customFieldId));

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
          value={addFieldId}
          onChange={setAddFieldId}
          options={allFields.filter(f => !addedFieldIds.has(f.id)).map(f => ({ value: f.id, label: `${f.name} (${f.fieldType})` }))}
          style={{ width: 280 }}
          allowClear
        />
        <Button icon={<PlusOutlined />} onClick={handleAddField} disabled={!addFieldId}>
          Добавить
        </Button>
        <Button type="primary" onClick={handleSave} loading={saving} style={{ marginLeft: 'auto' }}>
          Сохранить
        </Button>
      </div>

      <Table
        rowKey="customFieldId"
        dataSource={items}
        columns={columns}
        pagination={false}
        size="small"
      />
    </div>
  );
}
