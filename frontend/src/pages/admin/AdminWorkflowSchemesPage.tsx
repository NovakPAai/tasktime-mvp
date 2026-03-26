import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Space, Tag, message, Popconfirm, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { workflowSchemesApi, type WorkflowScheme } from '../../api/workflow-schemes';

export default function AdminWorkflowSchemesPage() {
  const [schemes, setSchemes] = useState<WorkflowScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowScheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchemes(await workflowSchemesApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (s: WorkflowScheme) => {
    setEditing(s);
    form.setFieldsValue({ name: s.name, description: s.description ?? '' });
    setModalOpen(true);
  };

  const handleSave = async (vals: { name: string; description?: string }) => {
    setSaving(true);
    try {
      if (editing) {
        await workflowSchemesApi.update(editing.id, vals);
        message.success('Схема обновлена');
      } else {
        await workflowSchemesApi.create(vals);
        message.success('Схема создана');
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
      await workflowSchemesApi.delete(id);
      message.success('Схема удалена');
      load();
    } catch {
      message.error('Нельзя удалить: схема используется');
    }
  };

  const columns: ColumnsType<WorkflowScheme> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name, s) => (
        <Space>
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/workflow-schemes/${s.id}`)}>
            {name}
          </Button>
          {s.isDefault && <Tag color="blue">По умолчанию</Tag>}
        </Space>
      ),
    },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    { title: 'Маппингов', dataIndex: ['_count', 'items'], render: (v: number) => v ?? '—' },
    { title: 'Проектов', dataIndex: ['_count', 'projects'], render: (v: number) => v ?? '—' },
    {
      title: '',
      width: 120,
      render: (_, s) => (
        <Space>
          <Tooltip title="Настроить"><Button size="small" icon={<ApartmentOutlined />} onClick={() => navigate(`/admin/workflow-schemes/${s.id}`)} /></Tooltip>
          <Tooltip title="Переименовать"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} /></Tooltip>
          {!s.isDefault && (
            <Popconfirm title="Удалить схему?" onConfirm={() => handleDelete(s.id)} okText="Удалить" okButtonProps={{ danger: true }}>
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
        <h2 className="tt-page-title">Схемы workflow</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
      </div>

      <Table rowKey="id" dataSource={schemes} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать схему' : 'Новая схема'}
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
