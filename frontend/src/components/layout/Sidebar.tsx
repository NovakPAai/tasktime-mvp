/**
 * Sidebar — навигационная панель Flow Universe
 * Design source: Paper артборд 1KR-0 (inline-styles)
 * Pure React inline styles — zero CSS class dependencies
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { hasRequiredRole } from '../../lib/roles';
import type { UserRole, User } from '../../types';

// ─── Design tokens (Paper 1KR-0 dark + computed light) ───────────────────────
const T = {
  dark: {
    bg: '#0F1320',
    border: '#1E2640',
    itemActiveBg: 'rgba(79,110,247,0.14)',
    itemHoverBg: 'rgba(255,255,255,0.04)',
    acc: '#4F6EF7',
    inactive: '#8B949E',
    textPrimary: '#E2E8F8',
    textMuted: '#484F58',
  },
  light: {
    bg: '#FDFCFF',
    border: '#E5E0F5',
    itemActiveBg: 'rgba(79,110,247,0.08)',
    itemHoverBg: 'rgba(0,0,0,0.03)',
    acc: '#4F6EF7',
    inactive: '#6B7280',
    textPrimary: '#1A1A2E',
    textMuted: '#9CA3AF',
  },
};

// Logo gradient (Paper exact)
const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

// Avatar gradients
const AVATAR_GRADS = [
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(55% 0.12 -0.14) 0%, oklab(47% 0.06 -0.21) 100%)',
  'linear-gradient(in oklab 135deg, oklab(60% -0.09 0.12) 0%, oklab(52% -0.04 0.16) 100%)',
  'linear-gradient(in oklab 135deg, oklab(58% 0.11 0.06) 0%, oklab(50% 0.16 -0.04) 100%)',
];
function getInitials(n: string) {
  return n.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function avatarGrad(n: string) {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADS[h % AVATAR_GRADS.length]!;
}

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

// ─── Props ────────────────────────────────────────────────────────────────────
interface SidebarProps {
  isLight: boolean;
  mobileOpen: boolean;
  collapsed?: boolean;
  openKeys: string[];
  userRole?: UserRole;
  user?: User | null;
  animatingTheme?: boolean;
  onClose: () => void;
  onOpenKeysChange: (keys: string[]) => void;
  onNavigate: (key: string) => void;
  onThemeToggle: () => void;
  onLogout: () => void;
  onCollapseToggle?: () => void;
}

export default function Sidebar({
  isLight,
  mobileOpen,
  collapsed = false,
  openKeys,
  userRole,
  user,
  animatingTheme,
  onClose,
  onOpenKeysChange,
  onNavigate,
  onThemeToggle,
  onLogout,
  onCollapseToggle,
}: SidebarProps) {
  const location = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const tokens = isLight ? T.light : T.dark;
  const path = location.pathname;

  const isPlanningOpen = openKeys.includes('planning-submenu');
  const isAdminOpen = openKeys.includes('admin-submenu');
  const isAdmin = hasRequiredRole(userRole, 'ADMIN');
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  function toggleSubmenu(key: string) {
    onOpenKeysChange(
      openKeys.includes(key) ? openKeys.filter((k) => k !== key) : [...openKeys, key]
    );
  }

  // Active detection: exact match for '/', prefix match for others
  function isActive(key: string) {
    if (key === '/') return path === '/';
    return path === key || path.startsWith(key + '/');
  }

  function itemBg(key: string) {
    if (isActive(key)) return tokens.itemActiveBg;
    if (hovered === key) return tokens.itemHoverBg;
    return 'transparent';
  }
  function itemColor(key: string) {
    return isActive(key) ? tokens.acc : tokens.inactive;
  }

  const itemStyle = (key: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
    padding: collapsed ? '8px' : '8px 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 8, cursor: 'pointer',
    backgroundColor: itemBg(key),
    transition: 'background-color 0.15s',
    userSelect: 'none',
  });

  const textStyle = (key: string): React.CSSProperties => ({
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 13, lineHeight: '16px',
    color: itemColor(key),
    fontWeight: isActive(key) ? 500 : 400,
    flexGrow: 1,
    display: collapsed ? 'none' : undefined,
    whiteSpace: 'nowrap',
  });

  const subItemStyle = (key: string): React.CSSProperties => ({
    display: collapsed ? 'none' : 'flex',
    alignItems: 'center', gap: 10,
    padding: '6px 10px 6px 22px', borderRadius: 8, cursor: 'pointer',
    backgroundColor: isActive(key) ? tokens.itemActiveBg : hovered === key ? tokens.itemHoverBg : 'transparent',
    transition: 'background-color 0.15s',
    userSelect: 'none',
  });

  const subTextStyle = (key: string): React.CSSProperties => ({
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 12, lineHeight: '16px',
    color: isActive(key) ? tokens.acc : tokens.inactive,
    fontWeight: isActive(key) ? 500 : 400,
  });

  const sidebarW = collapsed ? 52 : 220;

  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', top: 0, left: 0, zIndex: 1000,
        width: 220, height: '100vh',
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: mobileOpen ? '8px 0 40px rgba(0,0,0,0.6)' : 'none',
        backgroundColor: tokens.bg,
        borderRight: `1px solid ${tokens.border}`,
        display: 'flex', flexDirection: 'column',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }
    : {
        width: sidebarW, minWidth: sidebarW, height: '100%',
        backgroundColor: tokens.bg,
        borderRight: `1px solid ${tokens.border}`,
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflow: 'hidden',
        transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1)',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      };

  type AdminNavItem =
    | { type: 'link'; path: string; label: string }
    | { type: 'divider'; label: string };

  const adminNavItems: AdminNavItem[] = [
    { type: 'divider', label: 'Обзор' },
    { type: 'link', path: '/admin/dashboard',   label: 'Дашборд' },
    { type: 'link', path: '/admin/monitoring',  label: 'Мониторинг' },

    { type: 'divider', label: 'Пользователи' },
    { type: 'link', path: '/admin/users',       label: 'Пользователи' },
    { type: 'link', path: '/admin/roles',       label: 'Назначение ролей' },

    { type: 'divider', label: 'Проекты' },
    { type: 'link', path: '/admin/projects',    label: 'Проекты' },
    { type: 'link', path: '/admin/categories',  label: 'Категории' },

    { type: 'divider', label: 'Задачи' },
    { type: 'link', path: '/admin/issue-type-configs',  label: 'Типы задач' },
    { type: 'link', path: '/admin/issue-type-schemes',  label: 'Схемы типов задач' },
    { type: 'link', path: '/admin/link-types',          label: 'Виды связей' },

    { type: 'divider', label: 'Поля' },
    { type: 'link', path: '/admin/custom-fields',  label: 'Кастомные поля' },
    { type: 'link', path: '/admin/field-schemas',  label: 'Схемы полей' },

    { type: 'divider', label: 'Workflow' },
    { type: 'link', path: '/admin/workflow-statuses',    label: 'Статусы' },
    { type: 'link', path: '/admin/workflows',            label: 'Workflow' },
    { type: 'link', path: '/admin/workflow-schemes',     label: 'Схемы workflow' },
    { type: 'link', path: '/admin/transition-screens',   label: 'Экраны переходов' },

    { type: 'divider', label: 'Релизы' },
    { type: 'link', path: '/admin/release-statuses',     label: 'Статусы релизов' },
    { type: 'link', path: '/admin/release-workflows',    label: 'Workflow релизов' },

    ...(isSuperAdmin ? [
      { type: 'divider' as const, label: 'Администрирование' },
      { type: 'link' as const, path: '/admin/system', label: 'Система' },
    ] : []),
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(3px)',
          }}
        />
      )}

      <div style={sidebarStyle}>

        {/* ─── Logo ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, padding: collapsed ? '20px 10px 16px' : '20px 16px 16px', overflow: 'hidden' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundImage: LOGO_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <rect x="2" y="2" width="5" height="5" rx="1" fill="#FFF" opacity={0.9} />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="#FFF" opacity={0.6} />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="#FFF" opacity={0.6} />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="#FFF" opacity={0.9} />
            </svg>
          </div>
          {!collapsed && (
            <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: '20px', color: tokens.textPrimary, flexShrink: 0, whiteSpace: 'nowrap' }}>
              Flow Universe
            </span>
          )}
          {/* Mobile close button */}
          {isMobile && (
            <button
              onClick={onClose}
              aria-label="Закрыть меню"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: 6 }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                <path d="M3 3l10 10M13 3L3 13" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* ─── Nav ───────────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: collapsed ? '8px 4px' : '8px 8px' }}>

          {/* Dashboard */}
          <div data-testid="nav-dashboard" style={itemStyle('/')} onClick={() => onNavigate('/')} onMouseEnter={() => setHovered('/')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <rect x="1" y="1" width="6" height="6" rx="1.5" fill={itemColor('/')} />
              <rect x="9" y="1" width="6" height="6" rx="1.5" fill={itemColor('/')} opacity={0.6} />
              <rect x="1" y="9" width="6" height="6" rx="1.5" fill={itemColor('/')} opacity={0.6} />
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill={itemColor('/')} opacity={0.4} />
            </svg>
            <span style={textStyle('/')}>Dashboard</span>
          </div>

          {/* Projects */}
          <div data-testid="nav-projects" style={itemStyle('/projects')} onClick={() => onNavigate('/projects')} onMouseEnter={() => setHovered('/projects')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <rect x="1" y="2" width="14" height="1.5" rx="0.75" fill={itemColor('/projects')} />
              <rect x="1" y="6" width="10" height="1.5" rx="0.75" fill={itemColor('/projects')} />
              <rect x="1" y="10" width="12" height="1.5" rx="0.75" fill={itemColor('/projects')} />
            </svg>
            <span style={textStyle('/projects')}>Projects</span>
          </div>

          {/* Business Teams */}
          <div data-testid="nav-business-teams" style={itemStyle('/business-teams')} onClick={() => onNavigate('/business-teams')} onMouseEnter={() => setHovered('/business-teams')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <rect x="5.5" y="1.5" width="5" height="3" rx="1" stroke={itemColor('/business-teams')} strokeWidth="1.25" />
              <rect x="1" y="9.5" width="4" height="3" rx="1" stroke={itemColor('/business-teams')} strokeWidth="1.25" />
              <rect x="6" y="11.5" width="4" height="3" rx="1" stroke={itemColor('/business-teams')} strokeWidth="1.25" />
              <rect x="11" y="9.5" width="4" height="3" rx="1" stroke={itemColor('/business-teams')} strokeWidth="1.25" />
              <path d="M8 4.5v2M8 6.5H3.5v3M8 6.5H12.5v3M8 6.5v5" stroke={itemColor('/business-teams')} strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            <span style={textStyle('/business-teams')}>Бизнес-команды</span>
          </div>

          {/* Flow Teams */}
          <div data-testid="nav-flow-teams" style={itemStyle('/flow-teams')} onClick={() => onNavigate('/flow-teams')} onMouseEnter={() => setHovered('/flow-teams')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="6" stroke={itemColor('/flow-teams')} strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2" stroke={itemColor('/flow-teams')} strokeWidth="1.25" />
              <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14" stroke={itemColor('/flow-teams')} strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            <span style={textStyle('/flow-teams')}>Потоковые команды</span>
          </div>

          {/* Planning submenu */}
          <div
            style={{ ...itemStyle('planning-submenu'), backgroundColor: hovered === 'planning-submenu' ? tokens.itemHoverBg : 'transparent' }}
            onClick={() => toggleSubmenu('planning-submenu')}
            onMouseEnter={() => setHovered('planning-submenu')}
            onMouseLeave={() => setHovered(null)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <path d="M8 1.5L9.5 6H14L10.5 9l1.5 5L8 11l-4 3 1.5-5L2 6h4.5L8 1.5z" stroke={tokens.inactive} strokeWidth="1.25" strokeLinejoin="round" />
            </svg>
            {!collapsed && (
              <>
                <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px', color: tokens.inactive, flexGrow: 1 }}>Planning</span>
                <svg width="12" height="12" fill="none" viewBox="0 0 12 12" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isPlanningOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <path d="M4.5 3L7.5 6L4.5 9" stroke={tokens.inactive} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </div>
          {isPlanningOpen && (
            <>
              <div data-testid="nav-sprints" style={subItemStyle('/sprints')} onClick={() => onNavigate('/sprints')} onMouseEnter={() => setHovered('/sprints')} onMouseLeave={() => setHovered(null)}>
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="6" stroke={isActive('/sprints') ? tokens.acc : tokens.inactive} strokeWidth="1.5" />
                  <path d="M8 5v3l2 2" stroke={isActive('/sprints') ? tokens.acc : tokens.inactive} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span style={subTextStyle('/sprints')}>Спринты</span>
              </div>
              <div data-testid="nav-releases" style={subItemStyle('/releases')} onClick={() => onNavigate('/releases')} onMouseEnter={() => setHovered('/releases')} onMouseLeave={() => setHovered(null)}>
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                  <path d="M8 1.5L14 5v6L8 14.5 2 11V5L8 1.5z" stroke={isActive('/releases') ? tokens.acc : tokens.inactive} strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="8" cy="8" r="1.5" fill={isActive('/releases') ? tokens.acc : tokens.inactive} />
                </svg>
                <span style={subTextStyle('/releases')}>Релизы</span>
              </div>
            </>
          )}

          {/* Time */}
          <div data-testid="nav-time" style={itemStyle('/time')} onClick={() => onNavigate('/time')} onMouseEnter={() => setHovered('/time')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="5.5" stroke={itemColor('/time')} strokeWidth="1.5" />
              <path d="M8 5.5v2.5l1.5 1.5" stroke={itemColor('/time')} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={textStyle('/time')}>My Time</span>
          </div>

          {/* Teams */}
          <div data-testid="nav-teams" style={itemStyle('/teams')} onClick={() => onNavigate('/teams')} onMouseEnter={() => setHovered('/teams')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <circle cx="5" cy="5" r="2.5" stroke={itemColor('/teams')} strokeWidth="1.5" />
              <circle cx="11" cy="5" r="2.5" stroke={itemColor('/teams')} strokeWidth="1.5" />
              <path d="M1 13c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke={itemColor('/teams')} strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 9c1.66 0 3 1.34 3 3v1" stroke={itemColor('/teams')} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={textStyle('/teams')}>Teams</span>
          </div>

          {/* DevOps section */}
          <div style={{ height: 1, backgroundColor: tokens.border, margin: '6px 4px' }} />
          {!collapsed && (
            <div style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: tokens.inactive, padding: '6px 12px 4px' }}>
              DevOps
            </div>
          )}
          <div data-testid="nav-pipeline" style={itemStyle('/pipeline')} onClick={() => onNavigate('/pipeline')} onMouseEnter={() => setHovered('/pipeline')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M8 2l2 4h4l-3.5 3 1.5 5L8 11l-4 3 1.5-5L2 6h4l2-4z" stroke={itemColor('/pipeline')} strokeWidth="1.5" fill="none" />
            </svg>
            <span style={textStyle('/pipeline')}>Pipeline</span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: tokens.border, margin: '6px 4px' }} />

          {/* Admin submenu (ADMIN only) */}
          {isAdmin && (
            <>
              <div
                style={{ ...itemStyle('admin-submenu'), backgroundColor: hovered === 'admin-submenu' ? tokens.itemHoverBg : 'transparent' }}
                onClick={() => toggleSubmenu('admin-submenu')}
                onMouseEnter={() => setHovered('admin-submenu')}
                onMouseLeave={() => setHovered(null)}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                  <path d="M8 1.5L2 4.5v3.5c0 3 2.3 5.8 6 6.5 3.7-.7 6-3.5 6-6.5V4.5L8 1.5z" stroke={tokens.inactive} strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M5.5 8l2 2 3-3" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {!collapsed && (
                  <>
                    <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px', color: tokens.inactive, flexGrow: 1 }}>Admin</span>
                    <svg width="12" height="12" fill="none" viewBox="0 0 12 12" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isAdminOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      <path d="M4.5 3L7.5 6L4.5 9" stroke={tokens.inactive} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </div>
              {isAdminOpen && adminNavItems.map((item, idx) => {
                if (item.type === 'divider') {
                  return (
                    <div key={`div-${idx}`} style={{ paddingLeft: 28, paddingTop: idx === 0 ? 4 : 10, paddingBottom: 2 }}>
                      <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: tokens.inactive, opacity: 0.55 }}>
                        {item.label}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={item.path} style={subItemStyle(item.path)} onClick={() => onNavigate(item.path)} onMouseEnter={() => setHovered(item.path)} onMouseLeave={() => setHovered(null)}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: isActive(item.path) ? tokens.acc : tokens.inactive, flexShrink: 0 }} />
                    <span style={subTextStyle(item.path)}>{item.label}</span>
                  </div>
                );
              })}
              <div style={{ height: 1, backgroundColor: tokens.border, margin: '6px 4px' }} />
            </>
          )}

          {/* Settings */}
          <div style={itemStyle('/settings')} onClick={() => onNavigate('/settings')} onMouseEnter={() => setHovered('/settings')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="3" stroke={itemColor('/settings')} strokeWidth="1.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke={itemColor('/settings')} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={textStyle('/settings')}>Настройки</span>
          </div>

          {/* UAT */}
          <div style={itemStyle('/uat')} onClick={() => onNavigate('/uat')} onMouseEnter={() => setHovered('/uat')} onMouseLeave={() => setHovered(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke={itemColor('/uat')} strokeWidth="1.5" />
              <path d="M4.5 8l2.5 2.5 4-4.5" stroke={itemColor('/uat')} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={textStyle('/uat')}>UAT чек-листы</span>
          </div>
        </div>

        {/* ─── Footer (user + theme + logout + collapse) ──────────────── */}
        <div style={{ borderTop: `1px solid ${tokens.border}`, padding: collapsed ? '12px 8px' : '12px 16px', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, flexDirection: collapsed ? 'column' : 'row' }}>
          {user && (
            <>
              <div style={{ width: 30, height: 30, borderRadius: '50%', backgroundImage: avatarGrad(user.name), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 11, fontWeight: 600, color: '#FFF', lineHeight: '14px' }}>
                  {getInitials(user.name)}
                </span>
              </div>
              {!collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flexGrow: 1 }}>
                  <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 500, color: tokens.textPrimary, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name}
                  </span>
                  <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: tokens.textMuted, lineHeight: '14px' }}>
                    {user.role}
                  </span>
                </div>
              )}
            </>
          )}

          {!collapsed && (
            <>
              {/* Theme toggle */}
              <button
                data-testid="nav-theme-toggle"
                onClick={onThemeToggle}
                title={isLight ? 'Тёмная тема' : 'Светлая тема'}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0, opacity: animatingTheme ? 0.5 : 1, transition: 'opacity 0.3s' }}
              >
                {isLight ? (
                  <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                    <circle cx="8" cy="8" r="3" stroke={tokens.inactive} strokeWidth="1.5" />
                    <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                    <path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 100 11 6 6 0 008-3z" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Logout */}
              <button
                data-testid="nav-logout"
                onClick={onLogout}
                title="Выйти"
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0 }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                  <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M10.5 11L14 8l-3.5-3" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 8H6" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}

          {/* Collapse toggle button (TTUI-87) — always visible on desktop */}
          {!isMobile && onCollapseToggle && (
            <button
              onClick={onCollapseToggle}
              title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0, marginTop: collapsed ? 8 : 0 }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M10 3L6 8l4 5" stroke={tokens.inactive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

      </div>
    </>
  );
}
