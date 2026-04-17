import { useState, useEffect } from 'react';
import { Drawer, Table, Checkbox, Button, Space, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { roleSchemesApi, type ProjectRoleDefinition } from '../../api/role-schemes';

// TTSEC-2 Phase 3: granular sprint/release CRUD + *_DELETE_OTHERS for moderation.
// SPRINTS_MANAGE / RELEASES_MANAGE deliberately omitted — they remain in the enum (Postgres
// has no DROP VALUE) but are no longer surfaced in the matrix. Backfill in Phase 1 migration
// grants equivalent granular perms to every role that had `*_MANAGE`. Additional user-group
// admin perms (USER_GROUP_VIEW / USER_GROUP_MANAGE) live in a separate system category.
const PERMISSION_CATEGORIES = [
  {
    category: 'Задачи',
    permissions: [
      { key: 'ISSUES_VIEW',          label: 'Просмотр' },
      { key: 'ISSUES_CREATE',        label: 'Создание' },
      { key: 'ISSUES_EDIT',          label: 'Редактирование' },
      { key: 'ISSUES_DELETE',        label: 'Удаление' },
      { key: 'ISSUES_ASSIGN',        label: 'Назначение' },
      { key: 'ISSUES_CHANGE_STATUS', label: 'Смена статуса' },
      { key: 'ISSUES_CHANGE_TYPE',   label: 'Смена типа' },
    ],
  },
  {
    category: 'Спринты',
    permissions: [
      { key: 'SPRINTS_VIEW',   label: 'Просмотр' },
      { key: 'SPRINTS_CREATE', label: 'Создание' },
      { key: 'SPRINTS_EDIT',   label: 'Редактирование' },
      { key: 'SPRINTS_DELETE', label: 'Удаление' },
    ],
  },
  {
    category: 'Релизы',
    permissions: [
      { key: 'RELEASES_VIEW',   label: 'Просмотр' },
      { key: 'RELEASES_CREATE', label: 'Создание' },
      { key: 'RELEASES_EDIT',   label: 'Редактирование' },
      { key: 'RELEASES_DELETE', label: 'Удаление' },
    ],
  },
  {
    category: 'Участники',
    permissions: [
      { key: 'MEMBERS_VIEW',   label: 'Просмотр' },
      { key: 'MEMBERS_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Время',
    permissions: [
      { key: 'TIME_LOGS_VIEW',          label: 'Просмотр' },
      { key: 'TIME_LOGS_CREATE',        label: 'Создание' },
      { key: 'TIME_LOGS_DELETE_OTHERS', label: 'Удаление чужих' },
      { key: 'TIME_LOGS_MANAGE',        label: 'Управление' },
    ],
  },
  {
    category: 'Комментарии',
    permissions: [
      { key: 'COMMENTS_VIEW',          label: 'Просмотр' },
      { key: 'COMMENTS_CREATE',        label: 'Создание' },
      { key: 'COMMENTS_DELETE_OTHERS', label: 'Удаление чужих' },
      { key: 'COMMENTS_MANAGE',        label: 'Управление' },
    ],
  },
  {
    category: 'Настройки проекта',
    permissions: [
      { key: 'PROJECT_SETTINGS_VIEW', label: 'Просмотр' },
      { key: 'PROJECT_SETTINGS_EDIT', label: 'Редактирование' },
    ],
  },
  {
    category: 'Доски',
    permissions: [
      { key: 'BOARDS_VIEW',   label: 'Просмотр' },
      { key: 'BOARDS_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Группы пользователей',
    permissions: [
      { key: 'USER_GROUP_VIEW',   label: 'Просмотр' },
      { key: 'USER_GROUP_MANAGE', label: 'Управление' },
    ],
  },
] as const;

interface Props {
  schemeId: string;
  role: ProjectRoleDefinition | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type PermissionMap = Record<string, boolean>;
type MatrixRow = { category: string; permissions: { key: string; label: string }[] };

export default function PermissionMatrixDrawer({ schemeId, role, open, onClose, onSaved }: Props) {
  const [permMap, setPermMap] = useState<PermissionMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!role || !open) return;
    const map: PermissionMap = {};
    for (const p of role.permissions) {
      map[p.permission] = p.granted;
    }
    setPermMap(map);
  }, [role, open]);

  const handleSave = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await roleSchemesApi.updatePermissions(schemeId, role.id, permMap);
      message.success('Права сохранены');
      onSaved();
      onClose();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!role) return;
    const map: PermissionMap = {};
    for (const p of role.permissions) map[p.permission] = p.granted;
    setPermMap(map);
  };

  const allLabels = Array.from(
    new Set(PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.label)))
  );

  const columns: ColumnsType<MatrixRow> = [
    {
      title: 'Категория',
      dataIndex: 'category',
      width: 160,
      render: (v: string) => <strong>{v}</strong>,
    },
    ...allLabels.map(label => ({
      title: label,
      width: 110,
      render: (_: unknown, row: MatrixRow) => {
        const perm = row.permissions.find(p => p.label === label);
        if (!perm) return null;
        return (
          <Checkbox
            checked={permMap[perm.key] ?? false}
            onChange={e => setPermMap(prev => ({ ...prev, [perm.key]: e.target.checked }))}
          />
        );
      },
    })),
  ];

  const dataSource: MatrixRow[] = PERMISSION_CATEGORIES.map(c => ({
    category: c.category,
    permissions: c.permissions as unknown as { key: string; label: string }[],
  }));

  return (
    <Drawer
      title={
        <Space>
          <span>Права:</span>
          <Tag color={role?.color ?? 'default'}>{role?.name}</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={760}
      extra={
        <Space>
          <Button onClick={handleReset}>Сбросить</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>Сохранить</Button>
        </Space>
      }
    >
      <Table
        rowKey="category"
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Drawer>
  );
}
