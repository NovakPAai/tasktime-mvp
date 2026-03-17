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
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import UatTestsPage from './pages/UatTestsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <LoadingSpinner />;
  return user ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  const { loadUser } = useAuthStore();
  const { mode } = useThemeStore();
  const isLight = mode === 'light';

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const antTheme = {
    algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
    token: {
      colorPrimary: isLight ? '#5e6ad2' : '#7b86ff',
      colorBgBase: isLight ? '#f5f5f7' : '#111117',
      colorBgContainer: isLight ? '#ffffff' : '#181821',
      colorBgElevated: isLight ? '#ffffff' : '#1c1c24',
      colorBgLayout: isLight ? '#eaeaed' : '#08080b',
      colorText: isLight ? '#1a1a2e' : '#e2e2e8',
      colorTextSecondary: isLight ? '#5a5a72' : '#8c8c9e',
      colorTextTertiary: isLight ? '#9a9aaa' : '#6e6e82',
      colorTextDisabled: isLight ? '#c0c0cc' : '#52526a',
      colorTextPlaceholder: isLight ? '#c0c0cc' : '#52526a',
      colorBorder: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.10)',
      colorBorderSecondary: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.07)',
      borderRadius: 4,
      fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
      fontSize: 14,
    },
  };

  return (
    <ConfigProvider theme={antTheme}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="admin" element={<AdminPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
