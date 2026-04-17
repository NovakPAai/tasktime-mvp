import { useState, useEffect } from 'react';
import { Select, Table, Button, Space, Tag, Typography, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminApi, type AdminUser, type ProjectRole } from '../../api/admin';
import { roleSchemesApi, type ProjectRoleDefinition } from '../../api/role-schemes';
import api from '../../api/client';

type ViewMode = 'by-user' | 'by-project';

export default function AdminRolesPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<ViewMode>('by-user');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; key: string }[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [projectMembers, setProjectMembers] = useState<{ user: AdminUser; roles: ProjectRole[] }[]>([]);

  const [newProjectId, setNewProjectId] = useState<string | undefined>();
  const [newUserId, setNewUserId] = useState<string | undefined>();
  const [newRoleId, setNewRoleId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);

  const [schemeRoles, setSchemeRoles] = useState<ProjectRoleDefinition[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    void adminApi.listUsers({ pageSize: 200 }).then(r => setUsers(r.users));
    void api.get<{ id: string; name: string; key: string }[]>('/projects').then(r => setProjects(r.data));
  }, []);

  const loadSchemeRoles = async (projectId: string) => {
    setRolesLoading(true);
    setSchemeRoles([]);
    setNewRoleId(undefined);
    try {
      const scheme = await roleSchemesApi.getForProject(projectId);
      setSchemeRoles(scheme.roles);
    } catch {
      void message.error('Не удалось загрузить роли схемы');
    } finally {
      setRolesLoading(false);
    }
  };

  const loadUserRoles = async (userId: string) => {
    try {
      setRoles(await adminApi.getUserRoles(userId));
    } catch {
      void message.error('Не удалось загрузить роли');
    }
  };

  const loadProjectRoles = async (projectId: string) => {
    try {
      const r = await adminApi.listUsers({ pageSize: 200 });
      const members = r.users
        .map(u => ({ user: u, roles: (u.projectRoles ?? []).filter(pr => pr.projectId === projectId) }))
        .filter(m => m.roles.length > 0);
      setProjectMembers(members);
    } catch {
      void message.error('Не удалось загрузить участников');
    }
  };

  const handleProjectSelectByUser = (projectId: string) => {
    setNewProjectId(projectId);
    void loadSchemeRoles(projectId);
  };

  const handleProjectSelectByProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    void loadProjectRoles(projectId);
    void loadSchemeRoles(projectId);
  };

  const handleAddRole = async () => {
    const userId = mode === 'by-user' ? selectedUserId : newUserId;
    const projectId = mode === 'by-user' ? newProjectId : selectedProjectId;
    if (!userId || !projectId || !newRoleId) return;
    setAdding(true);
    try {
      await adminApi.assignRole(userId, { projectId, roleId: newRoleId });
      void message.success('Роль назначена');
      setNewProjectId(undefined); setNewUserId(undefined); setNewRoleId(undefined);
      if (mode === 'by-user' && selectedUserId) await loadUserRoles(selectedUserId);
      else if (mode === 'by-project' && selectedProjectId) await loadProjectRoles(selectedProjectId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string, roleId: string) => {
    try {
      await adminApi.removeRole(userId, roleId);
      void message.success('Роль снята');
      if (mode === 'by-user' && selectedUserId) await loadUserRoles(selectedUserId);
      else if (mode === 'by-project' && selectedProjectId) await loadProjectRoles(selectedProjectId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка');
    }
  };

  const getRoleColor = (r: ProjectRole): string | undefined => {
    const def = schemeRoles.find(s => s.id === (r as unknown as { roleId?: string }).roleId);
    return def?.color ?? undefined;
  };

  const getRoleName = (r: ProjectRole): string => {
    const def = schemeRoles.find(s => s.id === (r as unknown as { roleId?: string }).roleId);
    return def?.name ?? r.role;
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Назначение ролей</Typography.Title>
        <Button icon={<SettingOutlined />} onClick={() => navigate('/admin/role-schemes')}>
          Настроить схемы доступа
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select
          value={mode}
          onChange={(v) => {
            setMode(v);
            setRoles([]); setProjectMembers([]);
            setNewProjectId(undefined); setSelectedProjectId(undefined);
            setSchemeRoles([]); setNewRoleId(undefined);
          }}
          options={[
            { value: 'by-user', label: 'По пользователю' },
            { value: 'by-project', label: 'По проекту' },
          ]}
          style={{ width: 180 }}
        />
        {mode === 'by-user' && (
          <Select
            placeholder="Выберите пользователя"
            style={{ width: 260 }}
            value={selectedUserId}
            onChange={(v) => { setSelectedUserId(v); void loadUserRoles(v); }}
            options={users.map(u => ({ value: u.id, label: `${u.name} <${u.email}>` }))}
            showSearch
            filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          />
        )}
        {mode === 'by-project' && (
          <Select
            placeholder="Выберите проект"
            style={{ width: 260 }}
            value={selectedProjectId}
            onChange={handleProjectSelectByProject}
            options={projects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
            showSearch
            filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          />
        )}
      </Space>

      {mode === 'by-user' && selectedUserId && (
        <>
          <Table
            rowKey="id"
            size="small"
            dataSource={roles}
            pagination={false}
            style={{ marginBottom: 16 }}
            columns={[
              { title: 'Проект', render: (_: unknown, r: ProjectRole) => `${r.project.key}: ${r.project.name}` },
              {
                title: 'Роль',
                render: (_: unknown, r: ProjectRole) => (
                  <Tag color={getRoleColor(r)}>{getRoleName(r)}</Tag>
                ),
              },
              { title: 'Назначена', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
              {
                title: '',
                render: (_: unknown, r: ProjectRole) => (
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void handleRemove(selectedUserId, r.id)} />
                ),
              },
            ]}
          />
          <Space>
            <Select
              placeholder="Проект"
              style={{ width: 200 }}
              value={newProjectId}
              onChange={handleProjectSelectByUser}
              options={projects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
              showSearch
              filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())}
            />
            <Select
              placeholder="Роль"
              style={{ width: 180 }}
              value={newRoleId}
              onChange={setNewRoleId}
              loading={rolesLoading}
              disabled={!newProjectId || rolesLoading}
              options={schemeRoles.map(r => ({ value: r.id, label: r.name }))}
              optionRender={(opt) => {
                const r = schemeRoles.find(s => s.id === opt.value);
                return <Tag color={r?.color ?? 'default'}>{r?.name ?? String(opt.label)}</Tag>;
              }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={adding}
              disabled={!newProjectId || !newRoleId}
              onClick={() => void handleAddRole()}
            >
              Добавить
            </Button>
          </Space>
        </>
      )}

      {mode === 'by-project' && selectedProjectId && (
        <>
          <Table
            rowKey={(r) => r.user.id + (r.roles[0]?.id ?? '')}
            size="small"
            dataSource={projectMembers}
            pagination={false}
            style={{ marginBottom: 16 }}
            columns={[
              {
                title: 'Пользователь',
                render: (_: unknown, m: { user: AdminUser; roles: ProjectRole[] }) =>
                  `${m.user.name} <${m.user.email}>`,
              },
              {
                title: 'Роли',
                render: (_: unknown, m: { user: AdminUser; roles: ProjectRole[] }) => (
                  <Space>
                    {m.roles.map((r: ProjectRole) => (
                      <Tag
                        key={r.id}
                        color={getRoleColor(r)}
                        closable
                        onClose={() => void handleRemove(m.user.id, r.id)}
                      >
                        {getRoleName(r)}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
            ]}
          />
          <Space>
            <Select
              placeholder="Пользователь"
              style={{ width: 240 }}
              value={newUserId}
              onChange={setNewUserId}
              options={users.map(u => ({ value: u.id, label: `${u.name} <${u.email}>` }))}
              showSearch
              filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())}
            />
            <Select
              placeholder="Роль"
              style={{ width: 180 }}
              value={newRoleId}
              onChange={setNewRoleId}
              loading={rolesLoading}
              disabled={rolesLoading}
              options={schemeRoles.map(r => ({ value: r.id, label: r.name }))}
              optionRender={(opt) => {
                const r = schemeRoles.find(s => s.id === opt.value);
                return <Tag color={r?.color ?? 'default'}>{r?.name ?? String(opt.label)}</Tag>;
              }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={adding}
              disabled={!newUserId || !newRoleId}
              onClick={() => void handleAddRole()}
            >
              Добавить
            </Button>
          </Space>
        </>
      )}
    </div>
  );
}
