import { useState, useEffect } from 'react';
import { Layout, Menu, Button, Typography, Tooltip } from 'antd';
import {
  ProjectOutlined,
  LogoutOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  DeploymentUnitOutlined,
  MenuOutlined,
  CloseOutlined,
  SunFilled,
  MoonFilled,
  MonitorOutlined,
  TagsOutlined,
  LinkOutlined,
  AppstoreOutlined,
  BlockOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import UatOnboardingOverlay from '../uat/UatOnboardingOverlay';
import { hasRequiredRole } from '../../lib/roles';

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { mode, toggle } = useThemeStore();
  const isLight = mode === 'light';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [animatingTheme, setAnimatingTheme] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    location.pathname.startsWith('/admin') ? ['admin-submenu'] : []
  );

  // Закрываем сайдбар при смене маршрута
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Автоматически раскрываем admin-submenu при переходе на admin-страницы
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setOpenKeys((prev) => prev.includes('admin-submenu') ? prev : [...prev, 'admin-submenu']);
    }
  }, [location.pathname]);

  // Блокируем скролл body пока мобильный сайдбар открыт
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleThemeToggle = () => {
    setAnimatingTheme(true);
    toggle();
    setTimeout(() => setAnimatingTheme(false), 600);
  };

  const handleNav = (key: string) => {
    if (key.startsWith('/')) {
      navigate(key);
      setMobileOpen(false);
    }
  };

  const mainItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
    {
      key: '/business-teams',
      icon: <ApartmentOutlined />,
      label: 'Бизнес-команды',
    },
    {
      key: '/flow-teams',
      icon: <DeploymentUnitOutlined />,
      label: 'Потоковые команды',
    },
    { key: '/sprints', icon: <CalendarOutlined />, label: 'Sprints' },
    { key: '/time', icon: <ClockCircleOutlined />, label: 'My Time' },
    { key: '/teams', icon: <TeamOutlined />, label: 'Teams' },
    ...(hasRequiredRole(user?.role, 'ADMIN')
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
          ],
        }]
      : []),
    { key: '/settings', icon: <SettingOutlined />, label: 'Настройки' } as const,
  ];

  const toolsItems = [
    {
      key: '/uat',
      icon: <CheckCircleOutlined />,
      label: 'UAT чек-листы',
    },
  ];

  const menuItems = [
    {
      type: 'group' as const,
      key: 'main',
      label: 'Навигация',
      children: mainItems,
    },
    {
      type: 'group' as const,
      key: 'tools',
      label: 'Инструменты',
      children: toolsItems,
    },
  ];

  return (
    <Layout className="tt-app-shell">
      {/* Backdrop-оверлей — только на мобильных, когда сайдбар открыт */}
      {mobileOpen && (
        <div
          className="tt-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
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
          {/* Кнопка закрытия — видна только на мобиле внутри сайдбара */}
          <Button
            className="tt-sidebar-close-btn"
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => setMobileOpen(false)}
            aria-label="Закрыть меню"
          />
        </div>
        <Menu
          theme={isLight ? 'light' : 'dark'}
          mode="inline"
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          items={menuItems}
          className="tt-sidebar-menu"
          onClick={({ key }) => handleNav(key as string)}
        />
      </Sider>

      <Layout className="tt-main">
        <Header className="tt-topbar">
          {/* Гамбургер — виден только на мобиле */}
          <Button
            className="tt-mobile-hamburger"
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          />

          <div className="tt-topbar-right">
            <Tooltip title={isLight ? 'Тёмная тема' : 'Светлая тема'}>
              <Button
                type="text"
                icon={isLight ? <SunFilled /> : <MoonFilled />}
                onClick={handleThemeToggle}
                className={`tt-theme-toggle${animatingTheme ? ' animating' : ''}`}
                aria-label={isLight ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'}
              />
            </Tooltip>

            <Typography.Text className="tt-topbar-user">
              <span className="tt-topbar-user-name">{user?.name}</span>
              <span className="tt-topbar-role">{user?.role}</span>
            </Typography.Text>

            <Button
              size="small"
              icon={<LogoutOutlined />}
              className="tt-topbar-logout"
              onClick={handleLogout}
            >
              <span className="tt-topbar-logout-label">Logout</span>
            </Button>
          </div>
        </Header>

        <Content className="tt-content">
          <Outlet />
          <UatOnboardingOverlay />
        </Content>
      </Layout>
    </Layout>
  );
}
