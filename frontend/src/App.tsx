import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useAuthStore } from './store/auth.store';
import { useThemeStore } from './store/theme.store';
import * as tokens from './design-tokens';
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
import GlobalReleasesPage from './pages/GlobalReleasesPage';
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
import AdminWorkflowStatusesPage from './pages/admin/AdminWorkflowStatusesPage';
import AdminWorkflowsPage from './pages/admin/AdminWorkflowsPage';
import AdminWorkflowEditorPage from './pages/admin/AdminWorkflowEditorPage';
import AdminWorkflowSchemesPage from './pages/admin/AdminWorkflowSchemesPage';
import AdminWorkflowSchemeEditorPage from './pages/admin/AdminWorkflowSchemeEditorPage';
import AdminRoleSchemesPage from './pages/admin/AdminRoleSchemesPage';
import AdminRoleSchemeDetailPage from './pages/admin/AdminRoleSchemeDetailPage';
import AdminGroupsPage from './pages/admin/AdminGroupsPage';
import AdminGroupDetailPage from './pages/admin/AdminGroupDetailPage';
import AdminGate from './components/auth/AdminGate';
import AdminTransitionScreensPage from './pages/admin/AdminTransitionScreensPage';
import AdminTransitionScreenEditorPage from './pages/admin/AdminTransitionScreenEditorPage';
import AdminReleaseWorkflowsPage from './pages/admin/AdminReleaseWorkflowsPage';
import AdminReleaseWorkflowEditorPage from './pages/admin/AdminReleaseWorkflowEditorPage';
import AdminReleaseStatusesPage from './pages/admin/AdminReleaseStatusesPage';
import AdminSystemPage from './pages/admin/AdminSystemPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SettingsPage from './pages/SettingsPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import UatTestsPage from './pages/UatTestsPage';
import PipelineDashboardPage from './pages/PipelineDashboardPage';

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

  /**
   * TTUI-118: Дизайн-система синхронизирована с Paper.
   * Ant Design ConfigProvider использует значения из design-tokens.ts
   */
  const t = isLight ? tokens.light : tokens.dark;

  const antTheme = {
    algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
    token: {
      colorPrimary: t.acc,
      colorPrimaryHover: t.accH,
      colorInfo: t.acc,
      colorBgBase: t.bg,
      colorBgContainer: t.bgEl,
      colorBgElevated: t.bgEl,
      colorBgSpotlight: isLight ? '#ede9fe' : '#1e2640',
      colorBgLayout: t.bg,
      colorText: t.t1,
      colorTextBase: t.t1,
      colorTextSecondary: t.t2,
      colorTextTertiary: t.t3,
      colorTextDisabled: t.t4,
      colorTextPlaceholder: t.t4,
      colorFill: t.bgHover,
      colorFillSecondary: t.bgActive,
      colorFillTertiary: 'rgba(255,255,255,0.03)',
      colorSplit: t.b,
      colorBorder: t.b,
      colorBorderSecondary: t.b2,
      colorSuccess: tokens.semantic.success,
      colorWarning: tokens.semantic.warning,
      colorError: tokens.semantic.error,
      borderRadius: tokens.layout.r,
      borderRadiusSM: tokens.layout.r2,
      borderRadiusLG: tokens.layout.rActive,
      fontFamily: tokens.typography.fontSans,
      fontSize: tokens.typography.fsSm,
      fontSizeSM: tokens.typography.fsXs,
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
        borderRadius: tokens.layout.r2,
      },
      Tag: {
        borderRadiusSM: tokens.layout.rBadge,
        fontSizeSM: 11,
      },
      Table: {
        headerBg: isLight ? t.bgSb : '#080d1a',
        headerColor: t.t2,
        headerSplitColor: 'transparent',
        rowHoverBg: t.bgHover,
        cellPaddingBlock: 8,
        cellPaddingInline: 12,
      },
      Modal: {
        borderRadiusLG: tokens.layout.r,
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
        itemBorderRadius: tokens.layout.r3,
        subMenuItemBorderRadius: tokens.layout.r3,
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
            <Route path="releases" element={<GlobalReleasesPage />} />
            <Route path="issues/:id" element={<IssueDetailPage />} />
            <Route path="time" element={<TimePage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="uat" element={<UatTestsPage />} />
            {/*
              TTSEC-2 round 15: every /admin/* route now passes through a single <AdminGate>
              parent — unauthorised users get redirected before any admin page renders, and new
              admin routes can be added to this nested segment without remembering to wrap them.
            */}
            <Route path="admin" element={<AdminGate><Outlet /></AdminGate>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="monitoring" element={<AdminMonitoringPage />} />
              <Route path="projects" element={<AdminProjectsPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="link-types" element={<AdminLinkTypesPage />} />
              <Route path="issue-type-configs" element={<AdminIssueTypeConfigsPage />} />
              <Route path="issue-type-schemes" element={<AdminIssueTypeSchemesPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="roles" element={<AdminRolesPage />} />
              <Route path="custom-fields" element={<AdminCustomFieldsPage />} />
              <Route path="field-schemas" element={<AdminFieldSchemasPage />} />
              <Route path="field-schemas/:id" element={<AdminFieldSchemaDetailPage />} />
              <Route path="workflow-statuses" element={<AdminWorkflowStatusesPage />} />
              <Route path="workflows" element={<AdminWorkflowsPage />} />
              <Route path="workflows/:id" element={<AdminWorkflowEditorPage />} />
              <Route path="workflow-schemes" element={<AdminWorkflowSchemesPage />} />
              <Route path="workflow-schemes/:id" element={<AdminWorkflowSchemeEditorPage />} />
              <Route path="role-schemes" element={<AdminRoleSchemesPage />} />
              <Route path="role-schemes/:id" element={<AdminRoleSchemeDetailPage />} />
              <Route path="user-groups" element={<AdminGroupsPage />} />
              <Route path="user-groups/:id" element={<AdminGroupDetailPage />} />
              <Route path="transition-screens" element={<AdminTransitionScreensPage />} />
              <Route path="transition-screens/:id" element={<AdminTransitionScreenEditorPage />} />
              <Route path="release-workflows" element={<AdminReleaseWorkflowsPage />} />
              <Route path="release-workflows/:id" element={<AdminReleaseWorkflowEditorPage />} />
              <Route path="release-statuses" element={<AdminReleaseStatusesPage />} />
              <Route path="system" element={<AdminSystemPage />} />
            </Route>
            <Route path="settings" element={<SettingsPage />} />
            <Route path="pipeline" element={<PipelineDashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
