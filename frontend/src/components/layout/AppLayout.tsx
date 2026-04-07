/**
 * AppLayout — оболочка приложения Flow Universe
 * Design source: Paper (no topbar — controls folded into Sidebar footer)
 * Pure React inline styles — zero CSS class dependencies
 */
import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { useUiStore } from '../../store/ui.store';
import Sidebar from './Sidebar';
import UatOnboardingOverlay from '../uat/UatOnboardingOverlay';

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { mode, toggle } = useThemeStore();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const isLight = mode === 'light';

  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [animatingTheme, setAnimatingTheme] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const keys: string[] = [];
    if (location.pathname.startsWith('/admin')) keys.push('admin-submenu');
    if (location.pathname === '/sprints' || location.pathname === '/releases') keys.push('planning-submenu');
    return keys;
  });

  // Close sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Auto-expand submenus on navigate
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setOpenKeys((prev) => prev.includes('admin-submenu') ? prev : [...prev, 'admin-submenu']);
    }
    if (location.pathname === '/sprints' || location.pathname === '/releases') {
      setOpenKeys((prev) => prev.includes('planning-submenu') ? prev : [...prev, 'planning-submenu']);
    }
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open
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

  const bgColor = isLight ? '#F5F3FF' : '#080B14';

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', backgroundColor: bgColor, WebkitFontSmoothing: 'antialiased' }}>

      {/* Mobile hamburger — shown only when sidebar is closed on mobile */}
      {isMobile && !mobileOpen && (
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Открыть меню"
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 998,
          width: 36, height: 36, borderRadius: 8,
          backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(15,19,32,0.9)',
          border: `1px solid ${isLight ? '#E5E0F5' : '#1E2640'}`,
          display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
          <rect x="2" y="4" width="12" height="1.5" rx="0.75" fill={isLight ? '#1A1A2E' : '#E2E8F8'} />
          <rect x="2" y="7.25" width="9" height="1.5" rx="0.75" fill={isLight ? '#1A1A2E' : '#E2E8F8'} />
          <rect x="2" y="10.5" width="11" height="1.5" rx="0.75" fill={isLight ? '#1A1A2E' : '#E2E8F8'} />
        </svg>
      </button>
      )}

      <Sidebar
        isLight={isLight}
        mobileOpen={mobileOpen}
        collapsed={!isMobile && sidebarCollapsed}
        openKeys={openKeys}
        userRole={user?.role}
        user={user}
        animatingTheme={animatingTheme}
        onClose={() => setMobileOpen(false)}
        onOpenKeysChange={setOpenKeys}
        onNavigate={handleNav}
        onThemeToggle={handleThemeToggle}
        onLogout={handleLogout}
        onCollapseToggle={toggleSidebar}
      />

      {/* Main content area — TTUI-173: overflowY: auto enables page-level scrolling */}
      <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div id="main-scroll" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}>
          <Outlet />
          <UatOnboardingOverlay />
        </div>
      </div>

    </div>
  );
}
