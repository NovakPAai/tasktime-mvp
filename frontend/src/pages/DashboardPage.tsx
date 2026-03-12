import { useEffect, useState } from 'react';
import { Typography } from 'antd';
import { ProjectOutlined, UserOutlined, BugOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import * as adminApi from '../api/admin';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DashboardPage() {
  const { projects, loading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();
  const [adminStats, setAdminStats] = useState<adminApi.AdminStats | null>(null);
  const [adminStatsLoaded, setAdminStatsLoaded] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const canViewAdminStats = user && ['ADMIN', 'MANAGER', 'VIEWER'].includes(user.role);
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

  return (
    <div className="tt-page">
      <div>
        <h1 className="tt-page-title">Dashboard</h1>
        <p className="tt-page-subtitle">Overview of projects, issues and activity</p>
      </div>

      {adminStats && (
        <div className="tt-stats-grid">
          <div className="tt-stats-card">
            <div className="tt-stats-label">Projects</div>
            <div className="tt-stats-value">
              <ProjectOutlined className="tt-stats-icon" />
              {projects.length}
            </div>
          </div>
          <div className="tt-stats-card">
            <div className="tt-stats-label">Total Issues</div>
            <div className="tt-stats-value">
              <BugOutlined className="tt-stats-icon" />
              {totalIssues}
            </div>
          </div>
          <div className="tt-stats-card">
            <div className="tt-stats-label">Users</div>
            <div className="tt-stats-value">
              <UserOutlined className="tt-stats-icon" />
              {adminStats.counts.users}
            </div>
          </div>
          <div className="tt-stats-card">
            <div className="tt-stats-label">Time Logs</div>
            <div className="tt-stats-value">
              <ClockCircleOutlined className="tt-stats-icon" />
              {adminStats.counts.timeLogs}
            </div>
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
