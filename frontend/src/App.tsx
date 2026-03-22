import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useAuthStore } from './store/auth.store';
import { useThemeStore } from './store/theme.store';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import BusinessTeamsPage from './pages/BusinessTeamsPage';
import FlowTeamsPage from './pages/FlowTeamsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import IssueDetailPage from './pages/IssueDetailPage';
import BoardPage from './pages/BoardPage';
import SprintsPage from './pages/SprintsPage';
import GlobalSprintsPage from './pages/GlobalSprintsPage';
import ReleasesPage from './pages/ReleasesPage';
import TimePage from './pages/TimePage';
import TeamsPage from './pages/TeamsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminMonitoringPage from './pages/admin/AdminMonitoringPage';
import AdminProjectsPage from './pages/admin/AdminProjectsPage';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage';
import AdminLinkTypesPage from './pages/admin/AdminLinkTypesPage';
import AdminIssueTypeConfigsPage from './pages/admin/AdminIssueTypeConfigsPage';
import AdminIssueTypeSchemesPage from './pages/admin/AdminIssueTypeSchemesPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminRolesPage from './pages/admin/AdminRolesPage';
import AdminCustomFieldsPage from './pages/admin/AdminCustomFieldsPage';
import AdminFieldSchemasPage from './pages/admin/AdminFieldSchemasPage';
import AdminFieldSchemaDetailPage from './pages/admin/AdminFieldSchemaDetailPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SettingsPage from './pages/SettingsPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import UatTestsPage from './pages/UatTestsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" />;
  if (user.mustChangePassword && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" />;
  }
  return <>{children}</>;
}

export default function App() {
  const { loadUser } = useAuthStore();
  const { mode } = useThemeStore();
  const isLight = mode === 'light';

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Flow Universe UI Kit 2.0 — Design Tokens (TTUI-92)
  // Единый акцент #4F6EF7 для обеих тем. Ant Design токены обязательно
  // задавать hex-значениями — CSS vars в JS-контексте не работают.
  const antTheme = {
    algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
    token: {
      colorPrimary: '#4f6ef7',
      colorPrimaryHover: '#6b85ff',
      colorInfo: '#4f6ef7',
      colorBgBase: isLight ? '#f5f3ff' : '#03050f',
      colorBgContainer: isLight ? '#fdfcff' : '#0f1320',
      colorBgElevated: isLight ? '#fdfcff' : '#161e30',   // попапы, модалки, дропдауны
      colorBgSpotlight: isLight ? '#ede9fe' : '#1e2640',  // тултипы
      colorBgLayout: isLight ? '#ede9fe' : '#0b1535',
      colorText: isLight ? '#2e1065' : '#e2e8f8',
      colorTextBase: isLight ? '#2e1065' : '#e2e8f8',
      colorTextSecondary: isLight ? '#6d28d9' : '#8b949e',
      colorTextTertiary: isLight ? '#8b5cf6' : '#3d4d6b',
      colorTextDisabled: isLight ? '#a78bfa' : '#1e2d47',
      colorTextPlaceholder: isLight ? '#a78bfa' : '#1e2d47',
      colorFill: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
      colorFillSecondary: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
      colorFillTertiary: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
      colorSplit: isLight ? 'rgba(139,92,246,0.12)' : '#1e2640',
      colorBorder: isLight ? 'rgba(139,92,246,0.2)' : '#21262d',
      colorBorderSecondary: isLight ? 'rgba(139,92,246,0.12)' : '#1e2640',
      colorSuccess: '#22c55e',
      colorWarning: '#e8b84a',
      colorError: '#e5534b',
      borderRadius: 12,
      borderRadiusSM: 8,
      borderRadiusLG: 20,
      fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      fontSize: 13,
      fontSizeSM: 12,
      lineHeight: 1.5,
      controlHeight: 32,
      controlHeightSM: 26,
      controlHeightLG: 38,
      lineWidth: 1,
      motionDurationMid: '0.12s',
      motionDurationSlow: '0.18s',
    },
    components: {
      Button: {
        fontWeight: 500,
        paddingInline: 14,
        borderRadius: 8,
      },
      Tag: {
        borderRadiusSM: 4,
        fontSizeSM: 11,
      },
      Table: {
        headerBg: isLight ? '#ede9fe' : '#080d1a',
        headerColor: isLight ? '#6d28d9' : '#8b949e',
        headerSplitColor: 'transparent',
        rowHoverBg: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
        cellPaddingBlock: 8,
        cellPaddingInline: 12,
      },
      Modal: {
        borderRadiusLG: 16,
        paddingContentHorizontalLG: 24,
      },
      Drawer: {
        paddingLG: 20,
      },
      Select: {
        optionHeight: 32,
      },
      Menu: {
        itemHeight: 34,
        itemBorderRadius: 6,
        subMenuItemBorderRadius: 6,
      },
    },
  };

  return (
    <ConfigProvider theme={antTheme}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="business-teams" element={<BusinessTeamsPage />} />
            <Route path="flow-teams" element={<FlowTeamsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="projects/:id/board" element={<BoardPage />} />
            <Route path="projects/:id/sprints" element={<SprintsPage />} />
            <Route path="projects/:id/releases" element={<ReleasesPage />} />
            <Route path="sprints" element={<GlobalSprintsPage />} />
            <Route path="issues/:id" element={<IssueDetailPage />} />
            <Route path="time" element={<TimePage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="uat" element={<UatTestsPage />} />
            <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/monitoring" element={<AdminMonitoringPage />} />
            <Route path="admin/projects" element={<AdminProjectsPage />} />
            <Route path="admin/categories" element={<AdminCategoriesPage />} />
            <Route path="admin/link-types" element={<AdminLinkTypesPage />} />
            <Route path="admin/issue-type-configs" element={<AdminIssueTypeConfigsPage />} />
            <Route path="admin/issue-type-schemes" element={<AdminIssueTypeSchemesPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/roles" element={<AdminRolesPage />} />
            <Route path="admin/custom-fields" element={<AdminCustomFieldsPage />} />
            <Route path="admin/field-schemas" element={<AdminFieldSchemasPage />} />
            <Route path="admin/field-schemas/:id" element={<AdminFieldSchemaDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
