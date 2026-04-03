import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Popconfirm, ColorPicker } from 'antd';
import type { Color } from 'antd/es/color-picker';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { workflowStatusesApi, type WorkflowStatus, type StatusCategory } from '../../api/workflow-statuses';

const STATUS_PALETTE = [
  '#F44336', '#E91E63', '#FF5722', '#FF9800',
  '#FFC107', '#FFEB3B', '#8BC34A', '#4CAF50',
  '#00BCD4', '#2196F3', '#3F51B5', '#9C27B0',
  '#607D8B', '#9E9E9E', '#795548', '#000000',
];

function ColorPickerField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space>
      <ColorPicker
        format="hex"
        value={value}
        presets={[{ label: 'Палитра', colors: STATUS_PALETTE }]}
        onChange={(color: Color) => onChange?.(color.toHexString())}
        showText
      />
    </Space>
  );
}

const CATEGORY_OPTIONS: { value: StatusCategory; label: string; color: string }[] = [
  { value: 'TODO', label: 'To Do', color: 'default' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'processing' },
  { value: 'DONE', label: 'Done', color: 'success' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'error' },
];

export default function AdminWorkflowStatusesPage() {
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatuses(await workflowStatusesApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (s: WorkflowStatus) => {
    setEditing(s);
    form.setFieldsValue({ name: s.name, description: s.description ?? '', category: s.category, color: s.color });
    setModalOpen(true);
  };

  const handleSave = async (vals: { name: string; description?: string; category: StatusCategory; color?: string }) => {
    setSaving(true);
    try {
      if (editing) {
        await workflowStatusesApi.update(editing.id, { name: vals.name, description: vals.description, color: vals.color });
        message.success('Статус обновлён');
      } else {
        await workflowStatusesApi.create(vals);
        message.success('Статус создан');
      }
      setModalOpen(false);
      load();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workflowStatusesApi.delete(id);
      message.success('Статус удалён');
      load();
    } catch {
      message.error('Нельзя удалить: статус используется');
    }
  };

  const columns: ColumnsType<WorkflowStatus> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name, s) => (
        <Space>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
          {name}
        </Space>
      ),
    },
    {
      title: 'Категория',
      dataIndex: 'category',
      render: (cat: StatusCategory) => {
        const meta = CATEGORY_OPTIONS.find(o => o.value === cat);
        return <Tag color={meta?.color}>{meta?.label ?? cat}</Tag>;
      },
    },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    {
      title: 'Системный',
      dataIndex: 'isSystem',
      render: (v: boolean) => v ? <Tag>Системный</Tag> : null,
    },
    {
      title: '',
      width: 100,
      render: (_, s) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} />
          {!s.isSystem && (
            <Popconfirm title="Удалить статус?" onConfirm={() => handleDelete(s.id)} okText="Удалить" okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="tt-page-title">Статусы workflow</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
      </div>

      <Table rowKey="id" dataSource={statuses} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать статус' : 'Новый статус'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
            <Select options={CATEGORY_OPTIONS} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="color" label="Цвет">
            <ColorPickerField />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
