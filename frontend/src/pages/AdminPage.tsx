/** AdminPage — rebuild from Paper 40Y-0 (dark) + 47T-0 (light) */

import { useEffect, useState } from 'react';
import { Table, Form, Modal, Input, Switch, message, Select, DatePicker, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import * as adminApi from '../api/admin';
import * as authApi from '../api/auth';
import * as linksApi from '../api/links';
import type { User, Project, Sprint, IssueLinkType } from '../types';
import * as projectsApi from '../api/projects';
import * as sprintsApi from '../api/sprints';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AdminProjectsTab from '../components/admin/AdminProjectsTab';
import AdminCategoriesTab from '../components/admin/AdminCategoriesTab';
import AdminMonitoringTab from '../components/admin/AdminMonitoringTab';
import AdminIssueTypeConfigsTab from '../components/admin/AdminIssueTypeConfigsTab';
import AdminIssueTypeSchemesTab from '../components/admin/AdminIssueTypeSchemesTab';
import { useThemeStore } from '../store/theme.store';

// ─── Design tokens ────────────────────────────────────────────────────────────
const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const DARK_C = {
  bg: '#080B14', bgCard: '#0F1320', bgHdr: '#161B22',
  border: '#21262D', borderBtn: '#30363D', borderRow: '#21262D',
  t1: '#E2E8F8', t2: '#C9D1D9', t3: '#8B949E', t4: '#484F58',
  acc: '#4F6EF7', progressBg: '#21262D', rowHighlight: '#4F6EF70A',
  btnBg: '#161B22', btnText: '#C9D1D9',
};
const LIGHT_C = {
  bg: '#F6F8FA', bgCard: '#FFFFFF', bgHdr: '#F6F8FA',
  border: '#D0D7DE', borderBtn: '#D0D7DE', borderRow: '#EAEEF2',
  t1: '#1F2328', t2: '#3D444D', t3: '#656D76', t4: '#8C959F',
  acc: '#4F6EF7', progressBg: '#EAEEF2', rowHighlight: '#F6F8FA',
  btnBg: '#FFFFFF', btnText: '#1F2328',
};

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [LOGO_GRAD, '#10B981', '#F59E0B', '#A78BFA', '#6366F1', '#EF4444', '#3B82F6', '#EC4899'];

function avatarStyle(idx: number): React.CSSProperties {
  const c = AVATAR_COLORS[idx % AVATAR_COLORS.length];
  return c.startsWith('linear') ? { backgroundImage: c } : { backgroundColor: c };
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  systemRoles: string[];
  isActive: boolean;
  createdAt: string;
  createdIssues: number;
  assignedIssues: number;
  timeLogs: number;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'dashboard', label: 'Дашборд' },
  { key: 'monitoring', label: 'Мониторинг' },
  { key: 'projects', label: 'Проекты' },
  { key: 'categories', label: 'Категории' },
  { key: 'link-types', label: 'Виды связей' },
  { key: 'issue-type-configs', label: 'Типы задач' },
  { key: 'issue-type-schemes', label: 'Схемы типов' },
] as const;
type TabKey = typeof TABS[number]['key'];

const PAGE_SIZE = 10;

const STATUS_ORDER = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as const;

export default function AdminPage() {
  const { mode } = useThemeStore();
  const isDark = mode !== 'light';
  const C = isDark ? DARK_C : LIGHT_C;

  // ── State ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<adminApi.AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [usersPage, setUsersPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');

  // Link types
  const [linkTypes, setLinkTypes] = useState<IssueLinkType[]>([]);
  const [linkTypesLoading, setLinkTypesLoading] = useState(false);
  const [linkTypeSearch, setLinkTypeSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Reports
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedSprintId, setSelectedSprintId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [reportByStatus, setReportByStatus] = useState<{ status: string; _count: { _all: number } }[]>([]);
  const [reportByAssignee, setReportByAssignee] = useState<{ assignee: string; count: number }[]>([]);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, adminUsersPage, allUsers, allProjects] = await Promise.all([
          adminApi.getStats(),
          adminApi.listAdminUsers({ pageSize: 500 }),
          authApi.listUsers(),
          projectsApi.listProjects(),
        ]);
        setStats(statsData);
        const userMap: Record<string, User> = {};
        allUsers.forEach((u) => { userMap[u.id] = u; });
        setUsersMap(userMap);
        setUsers(
          adminUsersPage.users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            systemRoles: u.systemRoles,
            isActive: u.isActive,
            createdAt: u.createdAt,
            createdIssues: u._count.createdIssues,
            assignedIssues: u._count.assignedIssues,
            timeLogs: u._count.timeLogs,
          }))
        );
        setProjects(allProjects);
        if (allProjects.length > 0) setSelectedProjectId(allProjects[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const loadReports = async () => {
      if (!selectedProjectId) return;
      const [from, to] = dateRange;
      const [statusData, assigneeData, projectUsers] = await Promise.all([
        adminApi.getIssuesByStatusReport({ projectId: selectedProjectId, sprintId: selectedSprintId, from, to }),
        adminApi.getIssuesByAssigneeReport({ projectId: selectedProjectId, sprintId: selectedSprintId, from, to }),
        authApi.listUsers(),
      ]);
      const userMap: Record<string, User> = {};
      projectUsers.forEach((u) => { userMap[u.id] = u; });
      setUsersMap((prev) => ({ ...prev, ...userMap }));
      setReportByStatus(statusData);
      setReportByAssignee(assigneeData.map((row) => ({
        assignee: row.assigneeId ? userMap[row.assigneeId]?.name ?? 'Unknown' : 'Unassigned',
        count: row._count._all,
      })));
    };
    void loadReports();
  }, [selectedProjectId, selectedSprintId, dateRange]);

  useEffect(() => {
    const loadSprints = async () => {
      if (!selectedProjectId) {
        setSprints([]);
        setSelectedSprintId(undefined);
        return;
      }
      const page = await sprintsApi.listSprints(selectedProjectId);
      setSprints(page.data);
      setSelectedSprintId((prev) => {
        if (!prev) return page.data[0]?.id;
        const existsInProject = page.data.some((s) => s.id === prev);
        return existsInProject ? prev : page.data[0]?.id;
      });
    };
    void loadSprints();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const loadLinkTypes = async () => {
    setLinkTypesLoading(true);
    try {
      const types = await linksApi.listLinkTypes(true);
      setLinkTypes(types);
    } finally {
      setLinkTypesLoading(false);
    }
  };

  const handleCreateLinkType = async (values: { name: string; outboundName: string; inboundName: string }) => {
    setCreating(true);
    try {
      const newType = await linksApi.createLinkType(values);
      setLinkTypes((prev) => [...prev, newType]);
      setCreateModalOpen(false);
      createForm.resetFields();
      void message.success('Тип связи создан');
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleLinkType = async (id: string, isActive: boolean) => {
    try {
      const updated = await linksApi.updateLinkType(id, { isActive });
      setLinkTypes((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка обновления');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error || !stats) return (
    <div style={{ padding: 28, color: '#EF4444', background: isDark ? '#080B14' : '#F6F8FA', height: '100%' }}>
      {error ?? 'Failed to load admin data'}
    </div>
  );

  // ── Computed (theme-aware, inside component) ───────────────────────────────
  const ROLE_CFG: Record<string, { bg: string; text: string }> = isDark ? {
    ADMIN:   { bg: '#4F6EF726', text: '#4F6EF7' },
    MANAGER: { bg: '#10B98126', text: '#10B981' },
    USER:    { bg: '#8B949E26', text: '#8B949E' },
    VIEWER:  { bg: '#484F5826', text: '#484F58' },
  } : {
    ADMIN:   { bg: '#4F6EF71A', text: '#4F6EF7' },
    MANAGER: { bg: '#10B9811A', text: '#0D7A4E' },
    USER:    { bg: '#8C959F1F', text: '#57606A' },
    VIEWER:  { bg: '#8C959F1A', text: '#8C959F' },
  };

  const STATUS_BAR: Record<string, { label: string; bar: string }> = isDark ? {
    OPEN:        { label: '#8B949E', bar: '#8B949E' },
    IN_PROGRESS: { label: '#F59E0B', bar: '#F59E0B' },
    REVIEW:      { label: '#A78BFA', bar: '#A78BFA' },
    DONE:        { label: '#4ADE80', bar: '#4ADE80' },
    CANCELLED:   { label: '#484F58', bar: '#484F58' },
  } : {
    OPEN:        { label: '#656D76', bar: '#8C959F' },
    IN_PROGRESS: { label: '#D97706', bar: '#D97706' },
    REVIEW:      { label: '#7C3AED', bar: '#7C3AED' },
    DONE:        { label: '#1A7F37', bar: '#1A7F37' },
    CANCELLED:   { label: '#8C959F', bar: '#D0D7DE' },
  };

  const issuesByStatus = stats.issuesByStatus.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  const issuesByAssignee = stats.issuesByAssignee
    .map((row) => ({
      assignee: row.assigneeId ? usersMap[row.assigneeId]?.name ?? 'Unknown' : 'Unassigned',
      count: row._count._all,
    }))
    .slice(0, 6);

  const totalIssues = Object.values(issuesByStatus).reduce((s, v) => s + v, 0) || 1;
  const maxAssigneeCount = issuesByAssignee[0]?.count ?? 1;

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);

  const nowMs = Date.now();
  function relativeTime(iso: string): string {
    const diffMs = nowMs - new Date(iso).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 2) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ч назад`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} дн. назад`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return `${diffWeeks} нед. назад`;
    return `${Math.floor(diffDays / 30)} мес. назад`;
  }

  const currentMonth = new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  // ─── Link types columns ────────────────────────────────────────────────────
  const linkTypeColumns: ColumnsType<IssueLinkType> = [
    {
      title: 'Наименование', dataIndex: 'name', key: 'name',
      filteredValue: [linkTypeSearch],
      onFilter: (value, record) =>
        record.name.toLowerCase().includes(String(value).toLowerCase()) ||
        record.outboundName.toLowerCase().includes(String(value).toLowerCase()) ||
        record.inboundName.toLowerCase().includes(String(value).toLowerCase()),
    },
    { title: 'Исходящая связь', dataIndex: 'outboundName', key: 'outboundName' },
    { title: 'Входящая связь', dataIndex: 'inboundName', key: 'inboundName' },
    {
      title: 'Статус', dataIndex: 'isActive', key: 'isActive',
      render: (active: boolean) => (
        <span style={{ color: active ? '#4ADE80' : C.t3 }}>{active ? 'Активна' : 'Неактивна'}</span>
      ),
    },
    {
      title: 'Действия', key: 'actions',
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.isActive}
          onChange={(checked) => void handleToggleLinkType(record.id, checked)}
          checkedChildren="Вкл"
          unCheckedChildren="Выкл"
        />
      ),
    },
  ];

  // ─── Reports content (used inside dashboard tab) ──────────────────────────
  const reportsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
      <Space wrap>
        <Select
          placeholder="Проект" style={{ minWidth: 200 }}
          value={selectedProjectId}
          onChange={(value) => setSelectedProjectId(value)}
          options={projects.map((p) => ({ value: p.id, label: `${p.key} - ${p.name}` }))}
        />
        <Select
          allowClear placeholder="Спринт" style={{ minWidth: 200 }}
          value={selectedSprintId}
          onChange={(value) => setSelectedSprintId(value)}
          options={sprints.map((s) => ({ value: s.id, label: s.name }))}
        />
        <DatePicker.RangePicker
          onChange={(values) => setDateRange([
            values?.[0]?.startOf('day').toISOString(),
            values?.[1]?.endOf('day').toISOString(),
          ])}
        />
      </Space>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Задачи по статусу</div>
          {reportByStatus.length === 0 ? (
            <div style={{ color: C.t3, fontSize: 12 }}>Нет данных</div>
          ) : reportByStatus.map((row) => (
            <div key={row.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.borderRow}` }}>
              <span style={{ color: C.t2, fontSize: 12 }}>{row.status}</span>
              <span style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 12, fontWeight: 700 }}>{row._count._all}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>По исполнителю</div>
          {reportByAssignee.length === 0 ? (
            <div style={{ color: C.t3, fontSize: 12 }}>Нет данных</div>
          ) : reportByAssignee.map((row) => (
            <div key={row.assignee} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.borderRow}` }}>
              <span style={{ color: C.t2, fontSize: 12 }}>{row.assignee}</span>
              <span style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 12, fontWeight: 700 }}>{row.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Dashboard tab content ─────────────────────────────────────────────────
  const dashboardContent = (
    <>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12 }}>
        {([
          { label: 'Пользователей', value: stats.counts.users, sub: `${users.filter(u => u.isActive).length} активных`, subColor: isDark ? '#4ADE80' : '#1A7F37' },
          { label: 'Проектов', value: stats.counts.projects, sub: `${projects.length} проектов`, subColor: isDark ? '#4ADE80' : '#1A7F37' },
          { label: 'Задач', value: stats.counts.issues, sub: `${issuesByStatus['OPEN'] ?? 0} открытых`, subColor: isDark ? '#F59E0B' : '#D97706' },
          { label: 'Часов залогировано', value: stats.counts.timeLogs, sub: '+12% vs прошлый месяц', subColor: isDark ? '#4ADE80' : '#1A7F37' },
        ] as const).map(({ label, value, sub, subColor }) => (
          <div key={label} style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
              {label}
            </div>
            <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: '34px' }}>
              {value.toLocaleString('ru-RU')}
            </div>
            <div style={{ color: subColor, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, marginTop: 4 }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      {/* Main split: users table (flex 3) + right panels (flex 2) */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* Users table */}
        <div style={{ flex: 3, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Table toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Пользователи
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.bgHdr, border: `1px solid ${C.borderBtn}`, borderRadius: 6, padding: '5px 10px' }}>
                <svg width="12" height="12" fill="none" stroke={C.t3} strokeWidth="1.5" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, width: 90 }}
                  placeholder="Поиск..."
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setUsersPage(1); }}
                />
              </div>
              <div style={{ backgroundImage: LOGO_GRAD, borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                <span style={{ color: '#FFFFFF', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 500 }}>+ Добавить</span>
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ display: 'flex', alignItems: 'center', background: C.bgHdr, borderBottom: `1px solid ${C.border}`, paddingInline: 20 }}>
            {[
              { label: 'Пользователь', width: 200 },
              { label: 'Email', width: 190 },
              { label: 'Роль', width: 100 },
              { label: 'Последняя активность', width: 140 },
              { label: 'Действия', flex: true },
            ].map(({ label, width, flex }) => (
              <div key={label} style={{ ...(flex ? { flex: 1 } : { width, flexShrink: 0 }), color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', paddingBlock: 8 }}>
                {label}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {pagedUsers.map((user, rowIdx) => {
              const globalIdx = users.findIndex(u => u.id === user.id);
              const primaryRole = (user.systemRoles ?? []).find(r => r !== 'USER') ?? 'USER'; const roleCfg = ROLE_CFG[primaryRole] ?? ROLE_CFG['USER'];
              return (
                <div key={user.id} style={{ display: 'flex', alignItems: 'center', paddingInline: 20, borderBottom: `1px solid ${C.borderRow}`, background: rowIdx % 4 === 3 ? C.rowHighlight : 'transparent' }}>
                  {/* User */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, width: 200, paddingBlock: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 28, height: 28, borderRadius: '50%', ...avatarStyle(globalIdx) }}>
                      <span style={{ color: '#FFFFFF', fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 10, fontWeight: 700 }}>
                        {getInitials(user.name)}
                      </span>
                    </div>
                    <span style={{ color: C.t1, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>{user.name}</span>
                  </div>
                  {/* Email */}
                  <div style={{ width: 190, flexShrink: 0, color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email}
                  </div>
                  {/* Role */}
                  <div style={{ width: 100, flexShrink: 0 }}>
                    <span style={{ background: roleCfg.bg, borderRadius: 4, padding: '3px 8px', color: roleCfg.text, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.3px' }}>
                      {primaryRole}
                    </span>
                  </div>
                  {/* Last activity */}
                  <div style={{ width: 140, flexShrink: 0, color: user.isActive ? C.t3 : C.t4, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11 }}>
                    {relativeTime(user.createdAt)}
                  </div>
                  {/* Actions */}
                  <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                    <div style={{ border: `1px solid ${C.borderBtn}`, borderRadius: 5, padding: '3px 8px', background: isDark ? 'transparent' : C.bgHdr, cursor: 'pointer' }}>
                      <span style={{ color: C.t2, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11 }}>Роль</span>
                    </div>
                    <div style={{ border: `1px solid ${C.borderBtn}`, borderRadius: 5, padding: '3px 8px', background: isDark ? 'transparent' : C.bgHdr, cursor: 'pointer' }}>
                      <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11 }}>…</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>
              Показано {Math.min(usersPage * PAGE_SIZE, filteredUsers.length)} из {filteredUsers.length}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <div onClick={() => setUsersPage(p => Math.max(1, p - 1))} style={{ background: C.bgHdr, border: `1px solid ${C.borderBtn}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>
                <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11 }}>← Пред.</span>
              </div>
              {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map(page => (
                <div key={page} onClick={() => setUsersPage(page)} style={{ background: page === usersPage ? C.acc : C.bgHdr, border: page === usersPage ? 'none' : `1px solid ${C.borderBtn}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
                  <span style={{ color: page === usersPage ? '#FFFFFF' : C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11 }}>{page}</span>
                </div>
              ))}
              <div onClick={() => setUsersPage(p => Math.min(totalPages, p + 1))} style={{ background: C.bgHdr, border: `1px solid ${C.borderBtn}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>
                <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11 }}>След. →</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panels */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Задачи по статусам */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14 }}>
              Задачи по статусам
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_ORDER.map(status => {
                const count = issuesByStatus[status] ?? 0;
                const barWidth = Math.round((count / totalIssues) * 100);
                const cfg = STATUS_BAR[status];
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 90, flexShrink: 0, color: cfg.label, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>
                      {status.replace('_', ' ')}
                    </div>
                    <div style={{ flex: 1, height: 6, background: C.progressBg, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, backgroundColor: cfg.bar, borderRadius: 3 }} />
                    </div>
                    <div style={{ width: 36, textAlign: 'right', flexShrink: 0, color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 12, fontWeight: 700 }}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Топ по задачам */}
          <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14 }}>
              Топ по задачам
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {issuesByAssignee.length === 0 ? (
                <div style={{ color: C.t3, fontSize: 12 }}>Нет данных</div>
              ) : issuesByAssignee.map((row, idx) => {
                const barWidth = Math.round((row.count / maxAssigneeCount) * 100);
                const barColors = [LOGO_GRAD, '#10B981', '#F59E0B', '#A78BFA'];
                const bc = barColors[idx % barColors.length];
                const isGrad = bc.startsWith('linear');
                return (
                  <div key={row.assignee} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 28, height: 28, borderRadius: '50%', ...avatarStyle(idx) }}>
                      <span style={{ color: '#FFFFFF', fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 10, fontWeight: 700 }}>
                        {getInitials(row.assignee)}
                      </span>
                    </div>
                    <div style={{ flex: 1, color: C.t1, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.assignee}
                    </div>
                    <div style={{ width: 80, flexShrink: 0, height: 4, background: isDark ? '#21262D' : '#EAEEF2', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, ...(isGrad ? { backgroundImage: bc } : { backgroundColor: bc }), borderRadius: 2 }} />
                    </div>
                    <div style={{ width: 28, textAlign: 'right', flexShrink: 0, color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 12, fontWeight: 700 }}>
                      {row.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Reports section (below main area) */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14 }}>
          Отчёты
        </div>
        {reportsContent}
      </div>
    </>
  );


  // ─── Link types tab content ────────────────────────────────────────────────
  const linkTypesContent = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Input.Search
          placeholder="Поиск по названию или связи..."
          style={{ maxWidth: 320 }}
          value={linkTypeSearch}
          onChange={(e) => setLinkTypeSearch(e.target.value)}
          allowClear
        />
        <button
          onClick={() => { setCreateModalOpen(true); void loadLinkTypes(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundImage: LOGO_GRAD, border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', color: '#FFFFFF', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, fontWeight: 500 }}
        >
          <PlusOutlined style={{ fontSize: 12 }} /> Создать вид связи
        </button>
      </div>
      <Table<IssueLinkType>
        rowKey="id"
        dataSource={linkTypes}
        columns={linkTypeColumns}
        loading={linkTypesLoading}
        pagination={{ pageSize: 20 }}
      />
      <Modal
        title="Создать вид связи"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={createForm} layout="vertical" onFinish={(values: { name: string; outboundName: string; inboundName: string }) => void handleCreateLinkType(values)}>
          <Form.Item name="name" label="Наименование вида связи" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input placeholder="Блокирует" />
          </Form.Item>
          <Form.Item name="outboundName" label="Исходящая связь" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input placeholder="блокирует" />
          </Form.Item>
          <Form.Item name="inboundName" label="Входящая связь" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input placeholder="заблокировано" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );

  // ─── Tab content map ────────────────────────────────────────────────────────
  const TAB_CONTENT: Record<TabKey, React.ReactNode> = {
    dashboard: dashboardContent,
    monitoring: <AdminMonitoringTab />,
    projects: <AdminProjectsTab />,
    categories: <AdminCategoriesTab />,
    'link-types': linkTypesContent,
    'issue-type-configs': <AdminIssueTypeConfigsTab />,
    'issue-type-schemes': <AdminIssueTypeSchemesTab />,
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%', height: '100%', background: C.bg,
      display: 'flex', flexDirection: 'column',
      padding: '28px 28px 24px',
      gap: 20,
      fontFamily: '"Inter", system-ui, sans-serif',
      fontSize: 12, lineHeight: '16px',
      boxSizing: 'border-box',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      overflowY: 'auto',
    }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: '28px', marginBottom: 4 }}>
            Администрирование
          </div>
          <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px' }}>
            Системная статистика и управление пользователями
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ background: C.btnBg, border: `1px solid ${C.borderBtn}`, borderRadius: 8, padding: '7px 12px' }}>
            <span style={{ color: C.btnText, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>Все проекты ▾</span>
          </div>
          <div style={{ background: C.btnBg, border: `1px solid ${C.borderBtn}`, borderRadius: 8, padding: '7px 12px' }}>
            <span style={{ color: C.btnText, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>
              {currentMonth} ▾
            </span>
          </div>
        </div>
      </div>

      {/* Tabs nav */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: -20 }}>
        {TABS.map(tab => (
          <div
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'link-types' && linkTypes.length === 0) void loadLinkTypes();
            }}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              color: activeTab === tab.key ? C.acc : C.t3,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              borderBottom: activeTab === tab.key ? `2px solid ${C.acc}` : '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, minHeight: 0, paddingTop: 20 }}>
          {dashboardContent}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingTop: 20 }}>
          {TAB_CONTENT[activeTab]}
        </div>
      )}
    </div>
  );
}
