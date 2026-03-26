import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Space, Tag, message, Popconfirm, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { workflowsApi, type Workflow } from '../../api/workflows';

export default function AdminWorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkflows(await workflowsApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (w: Workflow) => {
    setEditing(w);
    form.setFieldsValue({ name: w.name, description: w.description ?? '' });
    setModalOpen(true);
  };

  const handleSave = async (vals: { name: string; description?: string }) => {
    setSaving(true);
    try {
      if (editing) {
        await workflowsApi.update(editing.id, vals);
        message.success('Workflow обновлён');
      } else {
        await workflowsApi.create(vals);
        message.success('Workflow создан');
      }
      setModalOpen(false);
      load();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (w: Workflow) => {
    try {
      await workflowsApi.copy(w.id);
      message.success('Workflow скопирован');
      load();
    } catch {
      message.error('Не удалось скопировать');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workflowsApi.delete(id);
      message.success('Workflow удалён');
      load();
    } catch {
      message.error('Нельзя удалить: workflow используется');
    }
  };

  const columns: ColumnsType<Workflow> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name, w) => (
        <Space>
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/workflows/${w.id}`)}>
            {name}
          </Button>
          {w.isDefault && <Tag color="blue">По умолчанию</Tag>}
          {w.isSystem && <Tag>Системный</Tag>}
        </Space>
      ),
    },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    { title: 'Шаги', dataIndex: ['_count', 'steps'], render: (v: number) => v ?? '—' },
    { title: 'Переходы', dataIndex: ['_count', 'transitions'], render: (v: number) => v ?? '—' },
    {
      title: '',
      width: 130,
      render: (_, w) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<ApartmentOutlined />} onClick={() => navigate(`/admin/workflows/${w.id}`)} />
          </Tooltip>
          <Tooltip title="Переименовать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(w)} />
          </Tooltip>
          <Tooltip title="Дублировать">
            <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(w)} />
          </Tooltip>
          {!w.isSystem && (
            <Popconfirm title="Удалить workflow?" onConfirm={() => handleDelete(w.id)} okText="Удалить" okButtonProps={{ danger: true }}>
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
        <h2 className="tt-page-title">Workflow</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
      </div>

      <Table rowKey="id" dataSource={workflows} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать workflow' : 'Новый workflow'}
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
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
