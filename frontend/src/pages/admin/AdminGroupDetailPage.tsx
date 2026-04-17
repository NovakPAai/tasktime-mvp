import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Space, Tag, message,
  Popconfirm, Tabs, Select, Tooltip, Result,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import {
  userGroupsApi,
  type UserGroupDetail,
  type UserGroupMember,
  type UserGroupProjectRole,
} from '../../api/user-groups';
import { adminApi, type AdminUser } from '../../api/admin';
import { listProjects } from '../../api/projects';
import { roleSchemesApi, type ProjectRoleScheme } from '../../api/role-schemes';
import type { Project } from '../../types';

/**
 * TTSEC-2 Phase 3: group detail with Members + Project Roles tabs.
 *
 * Grant project role UX: user picks a project → frontend fetches that project's active role
 * scheme via `/projects/:id/role-scheme` → role select populates with roles from THAT scheme.
 * Matches backend validation in grantProjectRole (role must belong to active scheme).
 */
export default function AdminGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<UserGroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit header
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [savingEdit, setSavingEdit] = useState(false);

  // Add members
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);

  // Grant project role
  const [grantOpen, setGrantOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [grantProjectId, setGrantProjectId] = useState<string | undefined>();
  const [grantProjectScheme, setGrantProjectScheme] = useState<ProjectRoleScheme | null>(null);
  const [grantSchemeLoading, setGrantSchemeLoading] = useState(false);
  const [grantRoleId, setGrantRoleId] = useState<string | undefined>();
  const [granting, setGranting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // AI review #66 round 3 🟠 — group is critical; projects/users are reference lists for
    // modals. Failing to load the reference lists should NOT hide the group page. Use
    // allSettled to keep partial degradation: group fails → fall back to error state; ref
    // lists fail → the page still renders, only the relevant modal shows an error on open.
    setLoadError(null);
    // AI review #66 round 8 🟡 — clear reference lists upfront so a subsequent partial-failure
    // cannot leave stale data from a previous group visible in modal dropdowns.
    setAllProjects([]);
    setAllUsers([]);
    try {
      const g = await userGroupsApi.get(id);
      setGroup(g);
    } catch (e: unknown) {
      // AI review #66 round 6 🟡 — keep error state separate from loading so the UI can show
      // a real "group not available" screen instead of an eternal «Загрузка...».
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      const msg = err?.response?.status === 404
        ? 'Группа не найдена'
        : err?.response?.data?.error ?? 'Не удалось загрузить группу';
      message.error(msg);
      setLoadError(msg);
      setLoading(false);
      return;
    }

    const [projectsResult, usersResult] = await Promise.allSettled([
      listProjects(),
      adminApi.listUsers({ isActive: true, pageSize: 500 }),
    ]);
    if (projectsResult.status === 'fulfilled') {
      setAllProjects(projectsResult.value);
    } else {
      message.warning('Не удалось загрузить список проектов');
    }
    if (usersResult.status === 'fulfilled') {
      setAllUsers(usersResult.value.users);
    } else {
      message.warning('Не удалось загрузить список пользователей');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // When the admin picks a project, fetch its active scheme so the role-select only lists roles
  // that backend will actually accept (grantProjectRole rejects cross-scheme roles with 400).
  //
  // AI review #66 round 2 🟠 — clear scheme state at the START of a new request and on ERROR,
  // so the previously-selected project's roles don't linger in the dropdown. Otherwise a failed
  // fetch would leave stale options that produce a 400 on submit.
  useEffect(() => {
    setGrantProjectScheme(null);
    setGrantRoleId(undefined);
    if (!grantProjectId) { setGrantSchemeLoading(false); return; }
    // AI review #66 round 9 🟡 — surface the scheme fetch as a loading state on the role select
    // so the user doesn't see an unexplained empty dropdown during the request.
    setGrantSchemeLoading(true);
    let cancelled = false;
    roleSchemesApi.getForProject(grantProjectId)
      .then(s => { if (!cancelled) setGrantProjectScheme(s); })
      .catch(() => {
        if (cancelled) return;
        message.error('Не удалось загрузить схему проекта');
      })
      .finally(() => { if (!cancelled) setGrantSchemeLoading(false); });
    return () => { cancelled = true; };
  }, [grantProjectId]);

  const memberColumns: ColumnsType<UserGroupMember> = [
    { title: 'Имя', dataIndex: ['user', 'name'] },
    { title: 'Email', dataIndex: ['user', 'email'] },
    { title: 'Добавлен', dataIndex: 'addedAt', render: (v: string) => new Date(v).toLocaleString('ru-RU') },
    { title: 'Добавил', dataIndex: ['addedBy', 'name'], render: (v: string | null) => v || '—' },
    {
      title: '', width: 80,
      render: (_, m) => (
        <Popconfirm
          title="Убрать пользователя из группы?"
          onConfirm={() => handleRemoveMember(m.userId)}
          okText="Убрать"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const projectRoleColumns: ColumnsType<UserGroupProjectRole> = [
    { title: 'Ключ', dataIndex: ['project', 'key'], render: (v: string) => <code>{v}</code> },
    { title: 'Проект', dataIndex: ['project', 'name'] },
    {
      title: 'Роль',
      render: (_, r) => (
        <Tag color={r.roleDefinition.color ?? 'default'}>{r.roleDefinition.name}</Tag>
      ),
    },
    {
      title: '', width: 100,
      render: (_, r) => (
        <Popconfirm
          title="Отозвать роль?"
          onConfirm={() => handleRevokeProjectRole(r.projectId)}
          okText="Отозвать"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger>Отозвать</Button>
        </Popconfirm>
      ),
    },
  ];

  const availableUsersForAdd = useMemo(() => {
    if (!group) return [];
    const existing = new Set(group.members.map(m => m.userId));
    return allUsers.filter(u => !existing.has(u.id));
  }, [allUsers, group]);

  const availableProjectsForGrant = useMemo(() => {
    if (!group) return allProjects;
    const bound = new Set(group.projectRoles.map(r => r.projectId));
    return allProjects.filter(p => !bound.has(p.id));
  }, [allProjects, group]);

  const handleSaveEdit = async (vals: { name: string; description?: string }) => {
    if (!group) return;
    setSavingEdit(true);
    try {
      await userGroupsApi.update(group.id, { name: vals.name, description: vals.description || null });
      message.success('Группа обновлена');
      setEditOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddMembers = async () => {
    if (!group || selectedUserIds.length === 0) return;
    setAddingMembers(true);
    try {
      await userGroupsApi.addMembers(group.id, selectedUserIds);
      message.success(`Добавлено: ${selectedUserIds.length}`);
      setAddMembersOpen(false);
      setSelectedUserIds([]);
      load();
    } catch {
      message.error('Не удалось добавить участников');
    } finally {
      setAddingMembers(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!group) return;
    try {
      await userGroupsApi.removeMember(group.id, userId);
      message.success('Участник удалён');
      load();
    } catch {
      message.error('Не удалось удалить участника');
    }
  };

  const handleGrant = async () => {
    if (!group || !grantProjectId || !grantRoleId) return;
    setGranting(true);
    try {
      await userGroupsApi.grantProjectRole(group.id, { projectId: grantProjectId, roleId: grantRoleId });
      message.success('Роль выдана');
      setGrantOpen(false);
      setGrantProjectId(undefined);
      setGrantRoleId(undefined);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error || 'Не удалось выдать роль');
    } finally {
      setGranting(false);
    }
  };

  // Takes projectId (not binding.id) — backend keys by (groupId, projectId) per @@unique.
  // See api/user-groups.ts revokeProjectRole for full contract note.
  const handleRevokeProjectRole = async (projectId: string) => {
    if (!group) return;
    try {
      await userGroupsApi.revokeProjectRole(group.id, projectId);
      message.success('Роль отозвана');
      load();
    } catch {
      message.error('Не удалось отозвать роль');
    }
  };

  if (loading) {
    return <div className="tt-page"><div>Загрузка...</div></div>;
  }
  if (loadError || !group) {
    return (
      <div className="tt-page">
        <Result
          status="warning"
          title={loadError ?? 'Группа недоступна'}
          extra={
            <Button type="primary" onClick={() => navigate('/admin/user-groups')}>
              К списку групп
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/user-groups')}>Назад</Button>
        <h2 className="tt-page-title" style={{ margin: 0 }}>{group.name}</h2>
        <Tooltip title="Переименовать">
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              editForm.setFieldsValue({ name: group.name, description: group.description ?? '' });
              setEditOpen(true);
            }}
          />
        </Tooltip>
      </div>

      {group.description && (
        <p style={{ color: '#888', marginBottom: 16 }}>{group.description}</p>
      )}

      <Tabs
        items={[
          {
            key: 'members',
            label: `Участники (${group.members.length})`,
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMembersOpen(true)}>
                    Добавить участников
                  </Button>
                </div>
                <Table
                  rowKey="userId"
                  dataSource={group.members}
                  columns={memberColumns}
                  pagination={{ pageSize: 20 }}
                  size="small"
                />
              </>
            ),
          },
          {
            key: 'projectRoles',
            label: `Проектные роли (${group.projectRoles.length})`,
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setGrantOpen(true)}>
                    Выдать роль в проекте
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  dataSource={group.projectRoles}
                  columns={projectRoleColumns}
                  pagination={false}
                  size="small"
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title="Редактировать группу"
        open={editOpen}
        onCancel={() => { setEditOpen(false); void load(); }}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={savingEdit}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleSaveEdit}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Добавить участников"
        open={addMembersOpen}
        onCancel={() => { setAddMembersOpen(false); setSelectedUserIds([]); void load(); }}
        onOk={handleAddMembers}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={addingMembers}
        okButtonProps={{ disabled: selectedUserIds.length === 0 }}
        destroyOnClose
        width={560}
      >
        <Select
          mode="multiple"
          placeholder="Выберите пользователей"
          value={selectedUserIds}
          onChange={setSelectedUserIds}
          style={{ width: '100%' }}
          showSearch
          filterOption={(input, opt) =>
            (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
          options={availableUsersForAdd.map(u => ({
            value: u.id,
            label: `${u.name} · ${u.email}`,
          }))}
        />
      </Modal>

      <Modal
        title="Выдать роль в проекте"
        open={grantOpen}
        onCancel={() => {
          setGrantOpen(false);
          setGrantProjectId(undefined);
          setGrantRoleId(undefined);
          void load();
        }}
        onOk={handleGrant}
        okText="Выдать"
        cancelText="Отмена"
        confirmLoading={granting}
        okButtonProps={{ disabled: !grantProjectId || !grantRoleId }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            placeholder="Проект"
            style={{ width: '100%' }}
            value={grantProjectId}
            onChange={setGrantProjectId}
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={availableProjectsForGrant.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
          />
          <Select
            placeholder={
              grantSchemeLoading
                ? 'Загрузка ролей…'
                : grantProjectScheme
                  ? 'Роль'
                  : 'Сначала выберите проект'
            }
            style={{ width: '100%' }}
            value={grantRoleId}
            onChange={setGrantRoleId}
            disabled={!grantProjectScheme || grantSchemeLoading}
            loading={grantSchemeLoading}
            options={(grantProjectScheme?.roles ?? []).map(r => ({
              value: r.id,
              label: r.name,
            }))}
          />
        </Space>
      </Modal>
    </div>
  );
}
