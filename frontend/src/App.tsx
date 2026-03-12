import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useAuthStore } from './store/auth.store';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import IssueDetailPage from './pages/IssueDetailPage';
import BoardPage from './pages/BoardPage';
import SprintsPage from './pages/SprintsPage';
import TimePage from './pages/TimePage';
import TeamsPage from './pages/TeamsPage';
import AdminPage from './pages/AdminPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import UatTestsPage from './pages/UatTestsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <LoadingSpinner />;
  return user ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const darkTheme = {
    algorithm: antdTheme.darkAlgorithm,
    token: {
      colorPrimary: 'var(--acc)',
      colorBgBase: 'var(--bg)',
      colorBgContainer: 'var(--bg)',
      colorBorder: 'var(--b2)',
      colorTextBase: 'var(--t1)',
      borderRadius: 4,
      fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
    },
  };

  return (
    <ConfigProvider theme={darkTheme}>
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
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="projects/:id/board" element={<BoardPage />} />
            <Route path="projects/:id/sprints" element={<SprintsPage />} />
            <Route path="issues/:id" element={<IssueDetailPage />} />
            <Route path="time" element={<TimePage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="uat" element={<UatTestsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
