import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Table, Tag, Space, Form, Input, Select, Switch, Modal, message,
  Popconfirm, Typography, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined } from '@ant-design/icons';
import * as rwApi from '../../api/release-workflows-admin';
import type { ReleaseWorkflow } from '../../api/release-workflows-admin';

const RELEASE_TYPE_LABEL: Record<string, string> = {
  ATOMIC: 'Атомарные',
  INTEGRATION: 'Интеграционные',
};

export default function AdminReleaseWorkflowsPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<ReleaseWorkflow[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseWorkflow | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setWorkflows(await rwApi.listReleaseWorkflows());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (wf: ReleaseWorkflow) => {
    setEditing(wf);
    form.setFieldsValue({
      name: wf.name,
      description: wf.description ?? '',
      releaseType: wf.releaseType ?? 'universal',
      isDefault: wf.isDefault,
      isActive: wf.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async (vals: {
    name: string;
    description?: string;
    releaseType?: string;
    isDefault: boolean;
    isActive: boolean;
  }) => {
    setSaving(true);
    try {
      const releaseType = vals.releaseType === 'universal' ? null : (vals.releaseType as 'ATOMIC' | 'INTEGRATION' | null);
      if (editing) {
        await rwApi.updateReleaseWorkflow(editing.id, {
          name: vals.name,
          description: vals.description || null,
          releaseType,
          isDefault: vals.isDefault,
          isActive: vals.isActive,
        });
        message.success('Workflow обновлён');
      } else {
        await rwApi.createReleaseWorkflow({
          name: vals.name,
          description: vals.description,
          releaseType,
          isDefault: vals.isDefault,
          isActive: vals.isActive,
        });
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

  const handleDelete = async (id: string) => {
    try {
      await rwApi.deleteReleaseWorkflow(id);
      message.success('Workflow удалён');
      load();
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === 'RELEASE_WORKFLOW_IN_USE') {
        message.error('Нельзя удалить: workflow используется релизами');
      } else {
        message.error('Не удалось удалить');
      }
    }
  };

  const columns: ColumnsType<ReleaseWorkflow> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name, wf) => (
        <Space>
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 500 }}
            onClick={() => navigate(`/admin/release-workflows/${wf.id}`)}
            icon={<ApartmentOutlined />}
          >
            {name}
          </Button>
          {wf.isDefault && <Tag color="blue">По умолчанию</Tag>}
        </Space>
      ),
    },
    {
      title: 'Тип релиза',
      dataIndex: 'releaseType',
      render: (t) => t ? <Tag>{RELEASE_TYPE_LABEL[t] ?? t}</Tag> : <Tag>Универсальный</Tag>,
    },
    {
      title: 'Статусов',
      render: (_, wf) => wf.steps.length,
      width: 100,
    },
    {
      title: 'Переходов',
      render: (_, wf) => wf.transitions.length,
      width: 100,
    },
    {
      title: 'Релизов',
      render: (_, wf) => wf._count.releases,
      width: 100,
    },
    {
      title: 'Активен',
      dataIndex: 'isActive',
      width: 90,
      render: (v) => <Badge status={v ? 'success' : 'default'} text={v ? 'Да' : 'Нет'} />,
    },
    {
      title: '',
      width: 100,
      render: (_, wf) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(wf)} />
          <Popconfirm
            title="Удалить workflow?"
            onConfirm={() => handleDelete(wf.id)}
            okText="Удалить"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Workflow релизов</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Создать workflow
        </Button>
      </div>

      <Table
        rowKey="id"
        dataSource={workflows}
        columns={columns}
        loading={loading}
        pagination={false}
        size="small"
      />

      <Modal
        title={editing ? 'Редактировать workflow' : 'Создать workflow'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); void load(); }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ isDefault: false, isActive: true, releaseType: 'universal' }}
        >
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Стандартный workflow" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="releaseType" label="Тип релиза">
            <Select
              options={[
                { value: 'universal', label: 'Универсальный (все типы)' },
                { value: 'ATOMIC', label: 'Атомарные релизы' },
                { value: 'INTEGRATION', label: 'Интеграционные релизы' },
              ]}
            />
          </Form.Item>
          <Form.Item name="isDefault" label="По умолчанию" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isActive" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>Сохранить</Button>
            <Button onClick={() => { setModalOpen(false); void load(); }}>Отмена</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
