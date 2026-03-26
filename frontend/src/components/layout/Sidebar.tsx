/**
 * Sidebar — навигационная панель Flow Universe
 * TTUI-121: выделено из AppLayout.tsx монолита
 */
import { Layout, Menu, Button, Typography, Tooltip } from 'antd';
import {
  ProjectOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  DeploymentUnitOutlined,
  CloseOutlined,
  MonitorOutlined,
  TagsOutlined,
  LinkOutlined,
  AppstoreOutlined,
  BlockOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  ControlOutlined,
  ProfileOutlined,
  TagOutlined,
  ThunderboltOutlined,
  NodeIndexOutlined,
  BranchesOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { hasRequiredRole } from '../../lib/roles';
import type { UserRole, User } from '../../types';

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'var(--acc)', 'var(--s-done)', 'var(--s-in-progress)', 'var(--s-review)',
  'var(--type-epic)', 'var(--type-story)', 'var(--acc-h)', 'var(--type-bug)',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

const { Sider } = Layout;

interface SidebarProps {
  isLight: boolean;
  mobileOpen: boolean;
  openKeys: string[];
  userRole?: UserRole;
  user?: User | null;
  onClose: () => void;
  onOpenKeysChange: (keys: string[]) => void;
  onNavigate: (key: string) => void;
}

export default function Sidebar({
  isLight,
  mobileOpen,
  openKeys,
  userRole,
  user,
  onClose,
  onOpenKeysChange,
  onNavigate,
}: SidebarProps) {
  const location = useLocation();

  const mainItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
    { key: '/business-teams', icon: <ApartmentOutlined />, label: 'Бизнес-команды' },
    { key: '/flow-teams', icon: <DeploymentUnitOutlined />, label: 'Потоковые команды' },
    {
      key: 'planning-submenu',
      icon: <ThunderboltOutlined />,
      label: 'Planning',
      children: [
        { key: '/sprints', icon: <CalendarOutlined />, label: 'Спринты' },
        { key: '/releases', icon: <TagOutlined />, label: 'Релизы' },
      ],
    },
    { key: '/time', icon: <ClockCircleOutlined />, label: 'My Time' },
    { key: '/teams', icon: <TeamOutlined />, label: 'Teams' },
    ...(hasRequiredRole(userRole, 'ADMIN')
      ? [{
          key: 'admin-submenu',
          icon: <SettingOutlined />,
          label: 'Admin',
          children: [
            { key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Дашборд' },
            { key: '/admin/monitoring', icon: <MonitorOutlined />, label: 'Мониторинг' },
            { key: '/admin/users', icon: <UserOutlined />, label: 'Пользователи' },
            { key: '/admin/roles', icon: <SafetyCertificateOutlined />, label: 'Назначение ролей' },
            { key: '/admin/projects', icon: <ProjectOutlined />, label: 'Проекты' },
            { key: '/admin/categories', icon: <TagsOutlined />, label: 'Категории' },
            { key: '/admin/link-types', icon: <LinkOutlined />, label: 'Виды связей' },
            { key: '/admin/issue-type-configs', icon: <AppstoreOutlined />, label: 'Типы задач' },
            { key: '/admin/issue-type-schemes', icon: <BlockOutlined />, label: 'Схемы типов задач' },
            { key: '/admin/custom-fields', icon: <ControlOutlined />, label: 'Кастомные поля' },
            { key: '/admin/field-schemas', icon: <ProfileOutlined />, label: 'Схемы полей' },
            { key: '/admin/workflow-statuses', icon: <TagOutlined />, label: 'Статусы' },
            { key: '/admin/workflows', icon: <BranchesOutlined />, label: 'Workflow' },
            { key: '/admin/workflow-schemes', icon: <NodeIndexOutlined />, label: 'Схемы workflow' },
            { key: '/admin/transition-screens', icon: <FormOutlined />, label: 'Экраны переходов' },
          ],
        }]
      : []),
    { key: '/settings', icon: <SettingOutlined />, label: 'Настройки' } as const,
  ];

  const toolsItems = [
    { key: '/uat', icon: <CheckCircleOutlined />, label: 'UAT чек-листы' },
  ];

  const menuItems = [
    { type: 'group' as const, key: 'main', label: 'Навигация', children: mainItems },
    { type: 'group' as const, key: 'tools', label: 'Инструменты', children: toolsItems },
  ];

  return (
    <>
      {/* Backdrop-оверлей — только на мобильных */}
      {mobileOpen && (
        <div
          className="tt-sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <Sider
        width="var(--sidebar-width)"
        theme={isLight ? 'light' : 'dark'}
        className={`tt-sidebar${mobileOpen ? ' tt-sidebar--open' : ''}`}
      >
        <div className="tt-sidebar-header">
          {/* Grid-иконка Flow Universe (Paper артборд: фиолетовая сетка) */}
          <svg className="tt-workspace-icon" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="22" height="22" rx="5" fill="url(#wg)" />
            <rect x="5" y="5" width="4" height="4" rx="1" fill="rgba(255,255,255,0.85)" />
            <rect x="13" y="5" width="4" height="4" rx="1" fill="rgba(255,255,255,0.85)" />
            <rect x="5" y="13" width="4" height="4" rx="1" fill="rgba(255,255,255,0.85)" />
            <rect x="13" y="13" width="4" height="4" rx="1" fill="rgba(255,255,255,0.85)" />
            <defs>
              <linearGradient id="wg" x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="var(--acc)" />
                <stop offset="1" stopColor="var(--type-epic)" />
              </linearGradient>
            </defs>
          </svg>
          <Typography.Text className="tt-sidebar-workspace-name">
            Flow Universe
          </Typography.Text>
          <Button
            className="tt-sidebar-close-btn"
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label="Закрыть меню"
          />
        </div>

        <Menu
          theme={isLight ? 'light' : 'dark'}
          mode="inline"
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          onOpenChange={(keys) => onOpenKeysChange(keys as string[])}
          items={menuItems}
          className="tt-sidebar-menu"
          onClick={({ key }) => onNavigate(key as string)}
        />

        {user && (
          <div className="tt-sidebar-user">
            <Tooltip title={user.email} placement="right">
              <div
                className="tt-sidebar-user-avatar"
                style={{ background: avatarColor(user.name) }}
              >
                {getInitials(user.name)}
              </div>
            </Tooltip>
            <div className="tt-sidebar-user-info">
              <span className="tt-sidebar-user-name">{user.name}</span>
              <span className="tt-sidebar-user-role">{user.role}</span>
            </div>
          </div>
        )}
      </Sider>
    </>
  );
}
