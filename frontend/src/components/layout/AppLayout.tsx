import { Layout, Menu, Button, Typography } from 'antd';
import { ProjectOutlined, LogoutOutlined, DashboardOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
    { key: '/time', icon: <ClockCircleOutlined />, label: 'My Time' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="80">
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            TaskTime
          </Typography.Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
          <Typography.Text>{user?.name} ({user?.role})</Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={handleLogout}>
            Logout
          </Button>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
