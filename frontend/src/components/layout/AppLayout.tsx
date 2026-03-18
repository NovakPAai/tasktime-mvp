import { Layout, Menu } from 'antd';
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
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import UatOnboardingOverlay from '../uat/UatOnboardingOverlay';
import { hasRequiredRole } from '../../lib/roles';

const { Sider, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const mainItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
    {
      key: '/business-teams',
      icon: <ApartmentOutlined />,
      label: 'Бизнес-функциональные команды',
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
      ? [{ key: '/admin', icon: <SettingOutlined />, label: 'Admin' } as const]
      : []),
  ];

  const toolsItems = [
    {
      key: '/uat',
      icon: <CheckCircleOutlined />,
      label: 'UAT чек-листы (MVP)',
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
      label: 'Инструменты MVP',
      children: toolsItems,
    },
  ];

  return (
    <Layout className="tt-app-shell">
      <Sider
        width={220}
        theme="dark"
        breakpoint="lg"
        collapsedWidth={80}
        className="tt-sidebar"
      >
        <div className="tt-sidebar-header">
          <div className="tt-workspace-dot" />
          <span className="tt-sidebar-workspace-name">TaskTime</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          className="tt-sidebar-menu"
          onClick={({ key }) => {
            if (typeof key === 'string' && key.startsWith('/')) {
              navigate(key);
            }
          }}
        />
        <div className="tt-sidebar-user">
          <div className="tt-sidebar-user-avatar">
            {user?.name?.slice(0, 2).toUpperCase() ?? 'U'}
          </div>
          <div className="tt-sidebar-user-info">
            <span className="tt-sidebar-user-name">{user?.name}</span>
            <span className="tt-sidebar-user-role">{user?.role}</span>
          </div>
          <button className="tt-sidebar-logout-btn" onClick={handleLogout} title="Logout">
            <LogoutOutlined />
          </button>
        </div>
      </Sider>
      <Layout className="tt-main">
        <Content className="tt-content">
          <Outlet />
          <UatOnboardingOverlay />
        </Content>
      </Layout>
    </Layout>
  );
}
