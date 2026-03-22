/**
 * Sidebar — навигационная панель Flow Universe
 * TTUI-121: выделено из AppLayout.tsx монолита
 */
import { Layout, Menu, Button, Typography } from 'antd';
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
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { hasRequiredRole } from '../../lib/roles';
import type { UserRole } from '../../types';

const { Sider } = Layout;

interface SidebarProps {
  isLight: boolean;
  mobileOpen: boolean;
  openKeys: string[];
  userRole?: UserRole;
  onClose: () => void;
  onOpenKeysChange: (keys: string[]) => void;
  onNavigate: (key: string) => void;
}

export default function Sidebar({
  isLight,
  mobileOpen,
  openKeys,
  userRole,
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
        width={220}
        theme={isLight ? 'light' : 'dark'}
        className={`tt-sidebar${mobileOpen ? ' tt-sidebar--open' : ''}`}
      >
        <div className="tt-sidebar-header">
          <div className="tt-workspace-dot" />
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
      </Sider>
    </>
  );
}
