/**
 * AppLayout — тонкая оболочка приложения Flow Universe
 * TTUI-121: рефакторинг монолита → Sidebar + TopBar + AppLayout
 *
 * Состояние (mobileOpen, openKeys, animatingTheme) живёт здесь и пробрасывается
 * в дочерние компоненты через props.
 */
import { useState, useEffect } from 'react';
import { Layout } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import UatOnboardingOverlay from '../uat/UatOnboardingOverlay';

const { Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { mode, toggle } = useThemeStore();
  const isLight = mode === 'light';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [animatingTheme, setAnimatingTheme] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const keys: string[] = [];
    if (location.pathname.startsWith('/admin')) keys.push('admin-submenu');
    if (location.pathname === '/sprints' || location.pathname === '/releases') keys.push('planning-submenu');
    return keys;
  });

  // Закрываем сайдбар при смене маршрута
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Автоматически раскрываем submenus при переходе
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setOpenKeys((prev) => prev.includes('admin-submenu') ? prev : [...prev, 'admin-submenu']);
    }
    if (location.pathname === '/sprints' || location.pathname === '/releases') {
      setOpenKeys((prev) => prev.includes('planning-submenu') ? prev : [...prev, 'planning-submenu']);
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

  return (
    <Layout className="tt-app-shell">
      <Sidebar
        isLight={isLight}
        mobileOpen={mobileOpen}
        openKeys={openKeys}
        userRole={user?.role}
        onClose={() => setMobileOpen(false)}
        onOpenKeysChange={setOpenKeys}
        onNavigate={handleNav}
      />

      <Layout className="tt-main">
        <TopBar
          isLight={isLight}
          animatingTheme={animatingTheme}
          user={user}
          onMenuOpen={() => setMobileOpen(true)}
          onThemeToggle={handleThemeToggle}
          onLogout={handleLogout}
        />

        <Content className="tt-content">
          <Outlet />
          <UatOnboardingOverlay />
        </Content>
      </Layout>
    </Layout>
  );
}
