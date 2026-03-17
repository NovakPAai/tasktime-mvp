import { useState, useEffect, useRef } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Dropdown, Space, Typography,
} from 'antd';
import { MoreOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as projectsApi from '../../api/projects';
import * as categoriesApi from '../../api/project-categories';
import * as adminApi from '../../api/admin';
import type { Project, ProjectCategory } from '../../types';

const { Text } = Typography;

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ─── Delete confirmation modal with 5-second countdown ───────────────────────
function DeleteProjectModal({
  project,
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  project: Project | null;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [countdown, setCountdown] = useState(5);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setCountdown(5);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open]);

  return (
    <Modal
      open={open}
      title={<Space><ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /><span>Удалить проект</span></Space>}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>Отменить удаление</Button>,
        <Button
          key="confirm"
          danger
          type="primary"
          disabled={countdown > 0 || loading}
          loading={loading}
          onClick={onConfirm}
        >
          {countdown > 0 ? `Подтвердить удаление (${countdown})` : 'Подтвердить удаление проекта и всех данных'}
        </Button>,
      ]}
    >
      <p>Вы собираетесь удалить проект <strong>{project?.name}</strong> ({project?.key}).</p>
      <p style={{ color: '#ff4d4f' }}>Все данные проекта (задачи, спринты, логи) будут удалены безвозвратно.</p>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();

  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c, u] = await Promise.all([
        projectsApi.listProjects(),
        categoriesApi.listCategories(),
        adminApi.listAdminUsers(),
      ]);
      setProjects(p);
      setCategories(c);
      setUsers(u);
    } catch {
      void message.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openEdit = (project: Project) => {
    setEditProject(project);
    editForm.setFieldsValue({
      name: project.name,
      description: project.description ?? '',
      ownerId: project.owner?.id ?? null,
      categoryId: project.category?.id ?? null,
    });
    setEditModalOpen(true);
  };

  const handleEdit = async (values: { name: string; description?: string; ownerId?: string | null; categoryId?: string | null }) => {
    if (!editProject) return;
    setEditLoading(true);
    try {
      const updated = await projectsApi.updateProject(editProject.id, values);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      void message.success('Проект обновлён');
      setEditModalOpen(false);
    } catch {
      void message.error('Ошибка при обновлении');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteProject) return;
    setDeleteLoading(true);
    try {
      await projectsApi.deleteProject(deleteProject.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteProject.id));
      void message.success('Проект удалён');
      setDeleteProject(null);
    } catch {
      void message.error('Ошибка при удалении');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: ColumnsType<Project> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name: string, r) => <a href={`/projects/${r.id}`} target="_blank" rel="noreferrer">{name}</a>,
    },
    { title: 'Код', dataIndex: 'key', width: 80 },
    {
      title: 'Руководитель',
      dataIndex: 'owner',
      render: (owner: Project['owner']) => owner?.name ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Категория',
      dataIndex: 'category',
      render: (cat: Project['category']) => cat?.name ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Обновлён',
      dataIndex: 'updatedAt',
      width: 120,
      render: (v: string) => new Date(v).toLocaleDateString('ru'),
    },
    {
      title: 'Задачи',
      dataIndex: '_count',
      width: 80,
      render: (c: Project['_count']) => c?.issues ?? 0,
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, record: Project) => (
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: 'Редактировать', onClick: () => openEdit(record) },
              { key: 'delete', label: <Text type="danger">Удалить</Text>, onClick: () => setDeleteProject(record) },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      <Table
        className="tt-table"
        rowKey="id"
        columns={columns}
        dataSource={projects}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
      />

      {/* Edit modal */}
      <Modal
        open={editModalOpen}
        title="Редактировать проект"
        onCancel={() => setEditModalOpen(false)}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отменить"
        confirmLoading={editLoading}
      >
        <Form form={editForm} layout="vertical" onFinish={(v) => { void handleEdit(v); }}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="ownerId" label="Руководитель проекта">
            <Select allowClear placeholder="Выберите руководителя" showSearch optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
            />
          </Form.Item>
          <Form.Item name="categoryId" label="Категория">
            <Select allowClear placeholder="Выберите категорию"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Delete confirmation */}
      <DeleteProjectModal
        project={deleteProject}
        open={!!deleteProject}
        onConfirm={() => { void handleDelete(); }}
        onCancel={() => setDeleteProject(null)}
        loading={deleteLoading}
      />
    </>
  );
}
