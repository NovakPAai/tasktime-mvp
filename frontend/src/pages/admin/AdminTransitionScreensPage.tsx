import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Space, Tag, message, Popconfirm, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { transitionScreensApi, type TransitionScreen } from '../../api/transition-screens';

export default function AdminTransitionScreensPage() {
  const [screens, setScreens] = useState<TransitionScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransitionScreen | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setScreens(await transitionScreensApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (s: TransitionScreen) => {
    setEditing(s);
    form.setFieldsValue({ name: s.name, description: s.description ?? '' });
    setModalOpen(true);
  };

  const handleSave = async (vals: { name: string; description?: string }) => {
    setSaving(true);
    try {
      if (editing) {
        await transitionScreensApi.update(editing.id, vals);
        message.success('Экран обновлён');
      } else {
        await transitionScreensApi.create(vals);
        message.success('Экран создан');
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
      await transitionScreensApi.delete(id);
      message.success('Экран удалён');
      load();
    } catch {
      message.error('Нельзя удалить: экран используется в переходах');
    }
  };

  const columns: ColumnsType<TransitionScreen> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name, s) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/transition-screens/${s.id}`)}>
          {name}
        </Button>
      ),
    },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    {
      title: 'Полей',
      render: (_, s) => <Tag>{s._count?.items ?? 0}</Tag>,
    },
    {
      title: 'В переходах',
      render: (_, s) => s._count?.transitions ?? '—',
    },
    {
      title: '',
      width: 120,
      render: (_, s) => (
        <Space>
          <Tooltip title="Настроить поля">
            <Button size="small" icon={<SettingOutlined />} onClick={() => navigate(`/admin/transition-screens/${s.id}`)} />
          </Tooltip>
          <Tooltip title="Переименовать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} />
          </Tooltip>
          <Popconfirm title="Удалить экран?" onConfirm={() => handleDelete(s.id)} okText="Удалить" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="tt-page-title">Экраны переходов</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
      </div>

      <Table rowKey="id" dataSource={screens} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать экран' : 'Новый экран'}
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
