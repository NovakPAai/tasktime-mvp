import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Space, Tag, Modal, Form, Switch, Select,
  message, Typography, Tooltip, Badge, Alert
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  KeyOutlined, WarningOutlined, CopyOutlined, UserOutlined
} from '@ant-design/icons';
import { adminApi, type AdminUser, type ProjectRole } from '../../api/admin';
import api from '../../api/client';

const { Text } = Typography;

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'red',
  ADMIN: 'orange',
  MANAGER: 'blue',
  USER: 'green',
  VIEWER: 'default',
};

function RoleTags({ roles }: { roles: ProjectRole[] }) {
  const shown = roles.slice(0, 3);
  const extra = roles.length - 3;
  return (
    <Space wrap size={2}>
      {shown.map(r => (
        <Tag key={r.id} color={ROLE_COLORS[r.role] ?? 'default'} style={{ fontSize: 11 }}>
          {r.project.key}: {r.role}
        </Tag>
      ))}
      {extra > 0 && <Tag>+{extra}</Tag>}
    </Space>
  );
}

function TempPasswordModal({ open, password, onClose }: { open: boolean; password: string; onClose: () => void }) {
  return (
    <Modal
      title="Временный пароль"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={() => {
          navigator.clipboard.writeText(password);
          void message.success('Скопировано');
        }}>
          Скопировать
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>Закрыть</Button>,
      ]}
    >
      <Alert
        type="warning"
        showIcon
        message="Сохраните пароль — он показывается только один раз"
        style={{ marginBottom: 16 }}
      />
      <Text code copyable style={{ fontSize: 18 }}>{password}</Text>
    </Modal>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Temp password
  const [tempPassword, setTempPassword] = useState('');
  const [tempPwdOpen, setTempPwdOpen] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Project roles in edit
  const [projects, setProjects] = useState<{ id: string; name: string; key: string }[]>([]);
  const [userRoles, setUserRoles] = useState<ProjectRole[]>([]);
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleProjectId, setNewRoleProjectId] = useState<string | undefined>();
  const [newRoleRole, setNewRoleRole] = useState<string | undefined>();

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [deleting, setDeleting] = useState(false);

  // Deactivate (offered when delete is blocked by dependencies)
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);
  const [deactivateDeps, setDeactivateDeps] = useState<Record<string, number>>({});
  const [deactivating, setDeactivating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.listUsers({ search: search || undefined, page, pageSize });
      setUsers(result.users);
      setTotal(result.total);
    } catch {
      void message.error('Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const loadProjects = async () => {
    try {
      const res = await api.get<{ id: string; name: string; key: string }[]>('/projects');
      setProjects(res.data);
    } catch {
      // ignore
    }
  };

  // Delete countdown
  useEffect(() => {
    if (!deleteOpen) { setDeleteCountdown(5); return; }
    if (deleteCountdown <= 0) return;
    const t = setTimeout(() => setDeleteCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [deleteOpen, deleteCountdown]);

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const result = await adminApi.createUser(values as { email: string; name: string; isSuperAdmin?: boolean });
      setTempPassword(result.tempPassword);
      setTempPwdOpen(true);
      setCreateOpen(false);
      createForm.resetFields();
      void loadUsers();
      void message.success('Пользователь создан');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async (user: AdminUser) => {
    setEditUser(user);
    editForm.setFieldsValue({ name: user.name, email: user.email, isActive: user.isActive });
    setUserRoles(user.projectRoles ?? []);
    setEditOpen(true);
    await loadProjects();
  };

  const handleSave = async () => {
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      await adminApi.updateUser(editUser!.id, values as { name?: string; email?: string; isActive?: boolean });
      setEditOpen(false);
      void loadUsers();
      void message.success('Сохранено');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async () => {
    if (!newRoleProjectId || !newRoleRole || !editUser) return;
    setAddingRole(true);
    try {
      const role = await adminApi.assignRole(editUser.id, { projectId: newRoleProjectId, role: newRoleRole });
      setUserRoles(prev => [...prev, role]);
      setNewRoleProjectId(undefined);
      setNewRoleRole(undefined);
      void loadUsers();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка назначения роли');
    } finally {
      setAddingRole(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!editUser) return;
    try {
      await adminApi.removeRole(editUser.id, roleId);
      setUserRoles(prev => prev.filter(r => r.id !== roleId));
      void loadUsers();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка удаления роли');
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    try {
      const result = await adminApi.resetPassword(user.id);
      setTempPassword(result.tempPassword);
      setTempPwdOpen(true);
      void message.success('Пароль сброшен');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка сброса пароля');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deleteUser(deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      void loadUsers();
      void message.success('Пользователь удалён');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; canDeactivate?: boolean; dependencies?: Record<string, number> } } };
      const data = err?.response?.data;
      if (data?.canDeactivate) {
        setDeleteOpen(false);
        setDeactivateTarget(deleteTarget);
        setDeactivateDeps(data.dependencies ?? {});
        setDeactivateOpen(true);
      } else {
        void message.error(data?.error || 'Ошибка удаления');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await adminApi.deactivateUser(deactivateTarget.id);
      setDeactivateOpen(false);
      setDeactivateTarget(null);
      void loadUsers();
      void message.success(`Пользователь отключён и переименован в "${deactivateTarget.name} (N/A)"`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка деактивации');
    } finally {
      setDeactivating(false);
    }
  };

  const columns = [
    {
      title: 'Пользователь',
      key: 'user',
      render: (_: unknown, u: AdminUser) => (
        <Space direction="vertical" size={0}>
          <Text strong>{u.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Text>
        </Space>
      ),
    },
    {
      title: 'Системная роль',
      key: 'role',
      render: (_: unknown, u: AdminUser) =>
        u.role === 'SUPER_ADMIN'
          ? <Tag color="red">SUPERADMIN</Tag>
          : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Проектные роли',
      key: 'projectRoles',
      render: (_: unknown, u: AdminUser) =>
        u.projectRoles?.length ? <RoleTags roles={u.projectRoles} /> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Статус',
      key: 'status',
      render: (_: unknown, u: AdminUser) => (
        <Space>
          <Badge status={u.isActive ? 'success' : 'error'} text={u.isActive ? 'Активен' : 'Неактивен'} />
          {u.mustChangePassword && (
            <Tooltip title="Требует смены пароля">
              <WarningOutlined style={{ color: '#e8b84a' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: unknown, u: AdminUser) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => void openEdit(u)} />
          </Tooltip>
          <Tooltip title="Сбросить пароль">
            <Button size="small" icon={<KeyOutlined />} onClick={() => void handleResetPassword(u)} />
          </Tooltip>
          <Tooltip title={u.isSystem ? 'Нельзя удалить системного пользователя' : 'Удалить'}>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={u.isSystem}
              onClick={() => { setDeleteTarget(u); setDeleteOpen(true); setDeleteCountdown(5); }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Пользователи</Typography.Title>
        <Space>
          <Input
            placeholder="Поиск по имени / email"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 240 }}
            allowClear
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Создать пользователя
          </Button>
        </Space>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
        columns={columns}
        pagination={{ total, pageSize, current: page, onChange: setPage, showTotal: t => `Всего: ${t}` }}
        size="small"
      />

      {/* Create modal */}
      <Modal
        title="Создать пользователя"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={creating}
        okText="Создать"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Иван Иванов" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="user@company.ru" />
          </Form.Item>
          <Form.Item name="isSuperAdmin" label="Роль SUPERADMIN" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal
        title={`Редактировать: ${editUser?.name}`}
        open={editOpen}
        onOk={() => void handleSave()}
        onCancel={() => setEditOpen(false)}
        confirmLoading={saving}
        okText="Сохранить"
        width={640}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isActive" label="Статус" valuePropName="checked">
            <Switch checkedChildren="Активен" unCheckedChildren="Неактивен" />
          </Form.Item>
        </Form>

        <Typography.Title level={5}>Проектные роли</Typography.Title>
        <Table
          rowKey="id"
          size="small"
          dataSource={userRoles}
          pagination={false}
          columns={[
            { title: 'Проект', render: (_: unknown, r: ProjectRole) => `${r.project.key}: ${r.project.name}` },
            { title: 'Роль', dataIndex: 'role', render: (role: string) => <Tag color={ROLE_COLORS[role]}>{role}</Tag> },
            {
              title: '',
              render: (_: unknown, r: ProjectRole) => (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void handleRemoveRole(r.id)} />
              ),
            },
          ]}
        />
        <Space style={{ marginTop: 12 }}>
          <Select
            placeholder="Выберите проект"
            style={{ width: 200 }}
            value={newRoleProjectId}
            onChange={setNewRoleProjectId}
            options={projects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
            showSearch
            filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          />
          <Select
            placeholder="Роль"
            style={{ width: 130 }}
            value={newRoleRole}
            onChange={setNewRoleRole}
            options={[
              { value: 'ADMIN', label: 'Admin' },
              { value: 'MANAGER', label: 'Manager' },
              { value: 'USER', label: 'User' },
              { value: 'VIEWER', label: 'Viewer' },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={addingRole}
            disabled={!newRoleProjectId || !newRoleRole}
            onClick={() => void handleAddRole()}
          >
            Добавить
          </Button>
        </Space>
      </Modal>

      {/* Temp password modal */}
      <TempPasswordModal open={tempPwdOpen} password={tempPassword} onClose={() => setTempPwdOpen(false)} />

      {/* Delete modal */}
      <Modal
        title="Удалить пользователя"
        open={deleteOpen}
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
        footer={[
          <Button key="cancel" onClick={() => { setDeleteOpen(false); setDeleteTarget(null); }}>Отмена</Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deleting}
            disabled={deleteCountdown > 0}
            onClick={() => void handleDelete()}
          >
            {deleteCountdown > 0 ? `Удалить (${deleteCountdown})` : 'Удалить'}
          </Button>,
        ]}
      >
        <Alert
          type="error"
          showIcon
          message={`Вы уверены, что хотите удалить пользователя "${deleteTarget?.name}"? Это действие необратимо.`}
        />
      </Modal>

      {/* Deactivate modal — shown when delete is blocked by dependencies */}
      <Modal
        title="Нельзя удалить пользователя"
        open={deactivateOpen}
        onCancel={() => { setDeactivateOpen(false); setDeactivateTarget(null); }}
        footer={[
          <Button key="cancel" onClick={() => { setDeactivateOpen(false); setDeactivateTarget(null); }}>Отмена</Button>,
          <Button key="deactivate" type="primary" loading={deactivating} onClick={() => void handleDeactivate()}>
            Отключить пользователя
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="У пользователя есть связанные данные — удаление невозможно"
          description={
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {deactivateDeps.assignedIssues > 0 && <li>Назначенных задач: {deactivateDeps.assignedIssues}</li>}
              {deactivateDeps.createdIssues > 0 && <li>Созданных задач: {deactivateDeps.createdIssues}</li>}
              {deactivateDeps.timeLogs > 0 && <li>Записей о времени: {deactivateDeps.timeLogs}</li>}
              {deactivateDeps.comments > 0 && <li>Комментариев: {deactivateDeps.comments}</li>}
              {deactivateDeps.ownedProjects > 0 && <li>Проектов во владении: {deactivateDeps.ownedProjects}</li>}
            </ul>
          }
        />
        <Text>
          Вы можете <Text strong>отключить</Text> пользователя <Text strong>&quot;{deactivateTarget?.name}&quot;</Text>.
          Его имя будет изменено на <Text code>{deactivateTarget?.name} (N/A)</Text>, аккаунт будет заблокирован,
          а назначить его на задачу станет невозможно.
        </Text>
      </Modal>
    </div>
  );
}
