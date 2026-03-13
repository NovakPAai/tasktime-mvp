import { Layout, Menu, Button, Typography } from 'antd';
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

const { Header, Sider, Content } = Layout;

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
          <Typography.Text className="tt-sidebar-workspace-name">
            TaskTime
          </Typography.Text>
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
      </Sider>
      <Layout className="tt-main">
        <Header className="tt-topbar">
          <Typography.Text className="tt-topbar-user">
            {user?.name} ({user?.role})
          </Typography.Text>
          <Button
            size="small"
            icon={<LogoutOutlined />}
            className="tt-topbar-logout"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Header>
        <Content className="tt-content">
          <Outlet />
          <UatOnboardingOverlay />
        </Content>
      </Layout>
    </Layout>
  );
}
