import { useEffect, useState } from 'react';
import { Typography } from 'antd';
import { ProjectOutlined, UserOutlined, BugOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import * as adminApi from '../api/admin';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { hasAnyRequiredRole } from '../lib/roles';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Доброе утро,';
  if (hour < 18) return 'Добрый день,';
  return 'Добрый вечер,';
}

export default function DashboardPage() {
  const { projects, loading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();
  const [adminStats, setAdminStats] = useState<adminApi.AdminStats | null>(null);
  const [adminStatsLoaded, setAdminStatsLoaded] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const canViewAdminStats = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER', 'VIEWER']);
    if (!canViewAdminStats || adminStatsLoaded) return;

    const loadStats = async () => {
      try {
        const stats = await adminApi.getStats();
        setAdminStats(stats);
      } catch {
        // ignore errors here, dashboard should still work without admin stats
      } finally {
        setAdminStatsLoaded(true);
      }
    };

    void loadStats();
  }, [user, adminStatsLoaded]);

  if (loading) return <LoadingSpinner />;

  const totalIssues = projects.reduce((sum, p) => sum + (p._count?.issues ?? 0), 0);

  const issuesByStatus = adminStats?.issuesByStatus ?? [];
  const issuesByAssignee = adminStats?.issuesByAssignee ?? [];

  const displayName = user?.name ?? user?.email ?? '';

  return (
    <div className="tt-page">
      <div className="tt-dashboard-greeting">
        <span className="tt-dashboard-greeting-label">{getGreeting()}</span>
        <h1 className="tt-dashboard-greeting-name">{displayName}</h1>
      </div>

      {adminStats && (
        <div className="tt-stats-grid">
          <div className="tt-stats-card">
            <ProjectOutlined className="tt-stats-icon" />
            <div className="tt-stats-value">{projects.length}</div>
            <div className="tt-stats-label">Проектов</div>
          </div>
          <div className="tt-stats-card">
            <BugOutlined className="tt-stats-icon" />
            <div className="tt-stats-value">{totalIssues}</div>
            <div className="tt-stats-label">Задач</div>
          </div>
          <div className="tt-stats-card">
            <UserOutlined className="tt-stats-icon" />
            <div className="tt-stats-value">{adminStats.counts.users}</div>
            <div className="tt-stats-label">Пользователей</div>
          </div>
          <div className="tt-stats-card">
            <ClockCircleOutlined className="tt-stats-icon" />
            <div className="tt-stats-value">{adminStats.counts.timeLogs}</div>
            <div className="tt-stats-label">Записей времени</div>
          </div>
        </div>
      )}

      <div className="tt-panel-grid">
        <div className="tt-panel">
          <div className="tt-panel-header">Issues by Status</div>
          <div className="tt-panel-body">
            {issuesByStatus.length === 0 ? (
              <div className="tt-panel-empty">
                <Typography.Text type="secondary">No data yet</Typography.Text>
              </div>
            ) : (
              issuesByStatus.map((row) => (
                <div key={row.status} className="tt-panel-row">
                  <span>{row.status}</span>
                  <span>{row._count._all}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="tt-panel">
          <div className="tt-panel-header">Issues by Assignee</div>
          <div className="tt-panel-body">
            {issuesByAssignee.length === 0 ? (
              <div className="tt-panel-empty">
                <Typography.Text type="secondary">No data yet</Typography.Text>
              </div>
            ) : (
              issuesByAssignee.map((row) => (
                <div
                  key={row.assigneeId ?? 'unassigned'}
                  className="tt-panel-row"
                >
                  <span>{row.assigneeName ?? row.assigneeId ?? 'Unassigned'}</span>
                  <span>{row._count._all}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
