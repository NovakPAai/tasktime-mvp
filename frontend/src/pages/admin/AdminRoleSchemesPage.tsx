import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Space, Tag, message, Popconfirm, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { roleSchemesApi, type ProjectRoleScheme } from '../../api/role-schemes';

export default function AdminRoleSchemesPage() {
  const [schemes, setSchemes] = useState<ProjectRoleScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRoleScheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchemes(await roleSchemesApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (s: ProjectRoleScheme) => {
    setEditing(s);
    form.setFieldsValue({ name: s.name, description: s.description ?? '' });
    setModalOpen(true);
  };

  const handleSave = async (vals: { name: string; description?: string }) => {
    setSaving(true);
    try {
      if (editing) {
        await roleSchemesApi.update(editing.id, vals);
        message.success('Схема обновлена');
      } else {
        await roleSchemesApi.create(vals);
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
      await roleSchemesApi.delete(id);
      message.success('Схема удалена');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      if (err?.response?.data?.error === 'SCHEME_IN_USE') {
        message.error('Нельзя удалить: схема используется проектами');
      } else {
        message.error('Не удалось удалить схему');
      }
    }
  };

  const columns: ColumnsType<ProjectRoleScheme> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name, s) => (
        <Space>
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/role-schemes/${s.id}`)}>
            {name}
          </Button>
          {s.isDefault && <Tag color="blue">По умолчанию</Tag>}
        </Space>
      ),
    },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    { title: 'Ролей', dataIndex: ['_count', 'roles'], render: (v: number) => v ?? '—' },
    { title: 'Проектов', dataIndex: ['_count', 'projects'], render: (v: number) => v ?? '—' },
    {
      title: '',
      width: 120,
      render: (_, s) => (
        <Space>
          <Tooltip title="Настроить">
            <Button size="small" icon={<ApartmentOutlined />} onClick={() => navigate(`/admin/role-schemes/${s.id}`)} />
          </Tooltip>
          <Tooltip title="Переименовать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} />
          </Tooltip>
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
        <h2 className="tt-page-title">Схемы доступа</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
      </div>

      <Table rowKey="id" dataSource={schemes} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать схему' : 'Новая схема доступа'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
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
