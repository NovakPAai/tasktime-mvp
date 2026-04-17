import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { canViewUserGroups } from './lib/roles';
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
              TTSEC-2 round 16 — partial revert of round 15's global AdminGate.
              AI review flagged that enforcing `hasSystemRole('ADMIN')` on EVERY existing admin
              route (monitoring, release-workflows, role-schemes, etc.) could regress access for
              roles like RELEASE_MANAGER/AUDITOR that previously relied on backend-only 403. No
              existing access-matrix audit accompanies this PR, so the guard stays scoped to the
              NEW user-groups routes only. Consolidation into a parent <AdminGate> wrapper
              deserves its own PR with an explicit per-page audit.
            */}
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
            <Route path="admin/workflow-statuses" element={<AdminWorkflowStatusesPage />} />
            <Route path="admin/workflows" element={<AdminWorkflowsPage />} />
            <Route path="admin/workflows/:id" element={<AdminWorkflowEditorPage />} />
            <Route path="admin/workflow-schemes" element={<AdminWorkflowSchemesPage />} />
            <Route path="admin/workflow-schemes/:id" element={<AdminWorkflowSchemeEditorPage />} />
            <Route path="admin/role-schemes" element={<AdminRoleSchemesPage />} />
            <Route path="admin/role-schemes/:id" element={<AdminRoleSchemeDetailPage />} />
            <Route path="admin/user-groups" element={<AdminGate allow={canViewUserGroups}><AdminGroupsPage /></AdminGate>} />
            <Route path="admin/user-groups/:id" element={<AdminGate allow={canViewUserGroups}><AdminGroupDetailPage /></AdminGate>} />
            <Route path="admin/transition-screens" element={<AdminTransitionScreensPage />} />
            <Route path="admin/transition-screens/:id" element={<AdminTransitionScreenEditorPage />} />
            <Route path="admin/release-workflows" element={<AdminReleaseWorkflowsPage />} />
            <Route path="admin/release-workflows/:id" element={<AdminReleaseWorkflowEditorPage />} />
            <Route path="admin/release-statuses" element={<AdminReleaseStatusesPage />} />
            <Route path="admin/system" element={<AdminSystemPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="pipeline" element={<PipelineDashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
