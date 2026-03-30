import { useState, useEffect } from 'react';
import { Select, Table, Button, Space, Tag, Typography, message, Drawer } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { adminApi, type AdminUser, type ProjectRole } from '../../api/admin';
import api from '../../api/client';

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'orange', MANAGER: 'blue', USER: 'green', VIEWER: 'default',
};

type ViewMode = 'by-user' | 'by-project';

const ACCESS_RIGHTS_MD = `# Права доступа в Flow Universe

## Роли в системе

В системе существует два уровня ролей:

- **Глобальные роли** — назначаются пользователю при регистрации или администратором. Определяют, что пользователь может делать во всей системе.
- **Роли в проектах** — назначаются пользователю внутри конкретного проекта. Хранятся в таблице \`UserProjectRole\`, расширяют или уточняют доступ в рамках проекта.

---

## Глобальные роли

| Роль | Описание |
|------|----------|
| \`SUPER_ADMIN\` | Суперадминистратор. Обходит все проверки прав. Единственный, кто может назначать роли в проектах и удалять пользователей. |
| \`ADMIN\` | Администратор системы. Управляет пользователями, проектами, командами. Не может удалять пользователей и назначать роли в проектах. |
| \`MANAGER\` | Менеджер проекта. Управляет задачами, спринтами, релизами, командами. Не управляет пользователями системы. |
| \`USER\` | Рядовой участник. Создаёт и редактирует задачи, логирует время, оставляет комментарии. Не управляет спринтами и командами. |
| \`VIEWER\` | Наблюдатель. Читает данные, просматривает статистику и логи активности. Не может ничего создавать или изменять. |

---

## Права в системе (глобальный уровень)

### Управление пользователями

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Просматривать список пользователей | ✅ | ✅ | ❌ | ❌ | ❌ |
| Создавать пользователей | ✅ | ❌ | ❌ | ❌ | ❌ |
| Редактировать пользователей | ✅ | ✅ | ❌ | ❌ | ❌ |
| Удалять пользователей | ✅ | ❌ | ❌ | ❌ | ❌ |
| Изменять глобальную роль пользователя | ✅ | ✅ | ❌ | ❌ | ❌ |
| Деактивировать пользователя | ✅ | ✅ | ❌ | ❌ | ❌ |
| Сбрасывать пароль пользователя | ✅ | ✅ | ❌ | ❌ | ❌ |
| Назначать роли пользователям в проектах | ✅ | ❌ | ❌ | ❌ | ❌ |
| Просматривать роли пользователя в проектах | ✅ | ✅ | ❌ | ❌ | ❌ |
| Изменить собственный пароль | ✅ | ✅ | ✅ | ✅ | ✅ |

### Управление проектами

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Просматривать список проектов | ✅ | ✅ | ✅ | ✅ | ✅ |
| Создавать проект | ✅ | ✅ | ✅ | ❌ | ❌ |
| Редактировать проект | ✅ | ✅ | ✅ | ❌ | ❌ |
| Удалять проект | ✅ | ✅ | ❌ | ❌ | ❌ |

### Управление задачами

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Просматривать задачи | ✅ | ✅ | ✅ | ✅ | ✅ |
| Создавать задачи | ✅ | ✅ | ✅ | ✅ | ❌ |
| Редактировать задачи | ✅ | ✅ | ✅ | ✅ | ❌ |
| Изменять статус задачи | ✅ | ✅ | ✅ | ✅ | ❌ |
| Назначать исполнителя задачи | ✅ | ✅ | ✅ | ❌ | ❌ |
| Удалять задачу | ✅ | ✅ | ❌ | ❌ | ❌ |

### Управление спринтами

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Просматривать спринты | ✅ | ✅ | ✅ | ✅ | ✅ |
| Создавать / редактировать спринт | ✅ | ✅ | ✅ | ❌ | ❌ |
| Запускать / закрывать спринт | ✅ | ✅ | ✅ | ❌ | ❌ |
| Перемещать задачи в спринт | ✅ | ✅ | ✅ | ❌ | ❌ |

### Комментарии и время

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Читать комментарии | ✅ | ✅ | ✅ | ✅ | ✅ |
| Создавать комментарии | ✅ | ✅ | ✅ | ✅ | ❌ |
| Редактировать / удалять свой комментарий | ✅ | ✅ | ✅ | ✅ | ❌ |
| Редактировать / удалять чужой комментарий | ✅ | ✅ | ❌ | ❌ | ❌ |
| Логировать время | ✅ | ✅ | ✅ | ✅ | ❌ |
| Просматривать время других пользователей | ✅ | ✅ | ✅ | ❌ | ❌ |

### Управление командами и релизами

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Создавать / редактировать команду | ✅ | ✅ | ✅ | ❌ | ❌ |
| Удалять команду | ✅ | ✅ | ❌ | ❌ | ❌ |
| Создавать / управлять релизом | ✅ | ✅ | ✅ | ❌ | ❌ |

### AI-функции

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Оценка трудоёмкости (AI estimate) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Декомпозиция задачи (AI decompose) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Рекомендация исполнителя (AI suggest) | ✅ | ✅ | ✅ | ✅ | ❌ |

### Администрирование и мониторинг

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:----:|:------:|
| Просматривать системную статистику | ✅ | ✅ | ✅ | ❌ | ✅ |
| Просматривать лог активности | ✅ | ✅ | ✅ | ❌ | ✅ |
| Просматривать метрики производительности | ✅ | ✅ | ✅ | ❌ | ❌ |
| Управлять типами задач и схемами | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Роли в проектах

Помимо глобальных ролей, пользователю можно назначить роль внутри конкретного проекта. Назначение выполняется через \`SUPER_ADMIN\` в разделе «Назначение ролей».

| Роль | Описание |
|------|----------|
| \`ADMIN\` (проект) | Полный контроль над проектом: все действия с задачами, участниками, настройками. |
| \`MANAGER\` (проект) | Управление спринтами, назначение задач, работа с релизами. |
| \`USER\` (проект) | Работа с задачами: создание, редактирование, логирование времени, комментарии. |
| \`VIEWER\` (проект) | Только чтение данных проекта. |

### Права по ролям в проекте

| Действие в проекте | ADMIN | MANAGER | USER | VIEWER |
|--------------------|:-----:|:-------:|:----:|:------:|
| Просматривать задачи | ✅ | ✅ | ✅ | ✅ |
| Создавать задачи | ✅ | ✅ | ✅ | ❌ |
| Редактировать задачи | ✅ | ✅ | ✅ | ❌ |
| Назначать исполнителя | ✅ | ✅ | ❌ | ❌ |
| Удалять задачи | ✅ | ❌ | ❌ | ❌ |
| Управлять спринтами | ✅ | ✅ | ❌ | ❌ |
| Логировать время | ✅ | ✅ | ✅ | ❌ |
| Оставлять комментарии | ✅ | ✅ | ✅ | ❌ |
| Управлять релизами | ✅ | ✅ | ❌ | ❌ |
| Настраивать / удалять проект | ✅ | ❌ | ❌ | ❌ |
`;

export default function AdminRolesPage() {
  const [mode, setMode] = useState<ViewMode>('by-user');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; key: string }[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [projectMembers, setProjectMembers] = useState<{ user: AdminUser; roles: ProjectRole[] }[]>([]);

  const [newProjectId, setNewProjectId] = useState<string | undefined>();
  const [newUserId, setNewUserId] = useState<string | undefined>();
  const [newRole, setNewRole] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    void adminApi.listUsers({ pageSize: 200 }).then(r => setUsers(r.users));
    void api.get<{ id: string; name: string; key: string }[]>('/projects').then(r => setProjects(r.data));
  }, []);

  const loadUserRoles = async (userId: string) => {
    try {
      const r = await adminApi.getUserRoles(userId);
      setRoles(r);
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

  const handleAddRole = async () => {
    const userId = mode === 'by-user' ? selectedUserId : newUserId;
    const projectId = mode === 'by-user' ? newProjectId : selectedProjectId;
    if (!userId || !projectId || !newRole) return;
    setAdding(true);
    try {
      await adminApi.assignRole(userId, { projectId, role: newRole });
      void message.success('Роль назначена');
      setNewProjectId(undefined); setNewUserId(undefined); setNewRole(undefined);
      if (mode === 'by-user' && selectedUserId) await loadUserRoles(selectedUserId);
      else if (mode === 'by-project' && selectedProjectId) await loadProjectRoles(selectedProjectId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка');
    } finally { setAdding(false); }
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Назначение ролей</Typography.Title>
        <Button
          icon={<QuestionCircleOutlined />}
          onClick={() => setHelpOpen(true)}
        >
          Справка по ролям
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select
          value={mode}
          onChange={(v) => { setMode(v); setRoles([]); setProjectMembers([]); }}
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
            onChange={(v) => { setSelectedProjectId(v); void loadProjectRoles(v); }}
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
              { title: 'Роль', dataIndex: 'role', render: (role: string) => <Tag color={ROLE_COLORS[role]}>{role}</Tag> },
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
            <Select placeholder="Проект" style={{ width: 200 }} value={newProjectId} onChange={setNewProjectId}
              options={projects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))} showSearch
              filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
            <Select placeholder="Роль" style={{ width: 130 }} value={newRole} onChange={setNewRole}
              options={['ADMIN','MANAGER','USER','VIEWER'].map(r => ({ value: r, label: r }))} />
            <Button type="primary" icon={<PlusOutlined />} loading={adding}
              disabled={!newProjectId || !newRole} onClick={() => void handleAddRole()}>
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
              { title: 'Пользователь', render: (_: unknown, m: { user: AdminUser; roles: ProjectRole[] }) => `${m.user.name} <${m.user.email}>` },
              {
                title: 'Роли',
                render: (_: unknown, m: { user: AdminUser; roles: ProjectRole[] }) => (
                  <Space>
                    {m.roles.map((r: ProjectRole) => (
                      <Tag key={r.id} color={ROLE_COLORS[r.role]} closable
                        onClose={() => void handleRemove(m.user.id, r.id)}>
                        {r.role}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
            ]}
          />
          <Space>
            <Select placeholder="Пользователь" style={{ width: 240 }} value={newUserId} onChange={setNewUserId}
              options={users.map(u => ({ value: u.id, label: `${u.name} <${u.email}>` }))} showSearch
              filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
            <Select placeholder="Роль" style={{ width: 130 }} value={newRole} onChange={setNewRole}
              options={['ADMIN','MANAGER','USER','VIEWER'].map(r => ({ value: r, label: r }))} />
            <Button type="primary" icon={<PlusOutlined />} loading={adding}
              disabled={!newUserId || !newRole} onClick={() => void handleAddRole()}>
              Добавить
            </Button>
          </Space>
        </>
      )}

      <Drawer
        title="Справка: права доступа"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        width={720}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <div className="tt-markdown-help">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {ACCESS_RIGHTS_MD}
          </ReactMarkdown>
        </div>
      </Drawer>
    </div>
  );
}
