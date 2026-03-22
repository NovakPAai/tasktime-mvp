/**
 * DashboardPage — главный экран Flow Universe
 * Дизайн: Paper артборд "Dashboard — Dark" (1KQ-0)
 * Sections: greeting → stat-cards → [Мои задачи | Последние события]
 */
import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Spin } from 'antd';
import {
  AppstoreOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  BugOutlined,
  PlusOutlined,
  RightOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import * as adminApi from '../api/admin';
import * as issuesApi from '../api/issues';
import * as timeApi from '../api/time';
import { hasAnyRequiredRole } from '../lib/roles';
import type { Issue } from '../types';
import type { UserTimeSummary } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро,';
  if (h < 18) return 'Добрый день,';
  return 'Добрый вечер,';
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} д назад`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  '#4f6ef7', '#7c3aed', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function formatAction(action: string, entityType: string): string {
  const a = action.toLowerCase();
  let verb = 'обновил(а)';
  if (a.includes('create')) verb = 'создал(а)';
  else if (a.includes('delete')) verb = 'удалил(а)';
  else if (a.includes('close') || a.includes('done')) verb = 'закрыл(а)';
  else if (a.includes('start')) verb = 'запустил(а)';
  else if (a.includes('assign')) verb = 'назначил(а)';
  const entity = entityType === 'issue' ? 'задачу' : entityType === 'sprint' ? 'спринт' : entityType;
  return `${verb} ${entity}`;
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN PROGRESS',
  REVIEW: 'REVIEW',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
};
const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

// ── component ─────────────────────────────────────────────────────────────────

interface MyIssue extends Issue {
  projectKey: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { projects, loading: projectsLoading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();

  const [adminStats, setAdminStats] = useState<adminApi.AdminStats | null>(null);
  const [myIssues, setMyIssues] = useState<MyIssue[]>([]);
  const [timeSummary, setTimeSummary] = useState<UserTimeSummary | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const canAdmin = hasAnyRequiredRole(user.role, ['ADMIN', 'MANAGER', 'VIEWER']);

      const [stats, timeSum] = await Promise.all([
        canAdmin ? adminApi.getStats().catch(() => null) : Promise.resolve(null),
        timeApi.getUserTimeSummary(user.id).catch(() => null),
      ]);
      setAdminStats(stats);
      setTimeSummary(timeSum);
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  // Fetch my issues once projects are loaded
  useEffect(() => {
    if (!user || projects.length === 0) return;
    const fetchMyIssues = async () => {
      try {
        const results = await Promise.all(
          projects.slice(0, 8).map(async (p) => {
            const list = await issuesApi.listIssues(p.id, { assigneeId: user.id });
            return list.map((issue): MyIssue => ({ ...issue, projectKey: p.key }));
          }),
        );
        const merged = results
          .flat()
          .filter((i) => i.status !== 'DONE' && i.status !== 'CANCELLED')
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 8);
        setMyIssues(merged);
      } catch {
        // не критично
      }
    };
    void fetchMyIssues();
  }, [user, projects]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // ── derived stats ────────────────────────────────────────────────────────────
  const activeCount = adminStats?.issuesByStatus.find((s) => s.status === 'IN_PROGRESS')?._count._all ?? 0;
  const openCount   = adminStats?.issuesByStatus.find((s) => s.status === 'OPEN')?._count._all ?? 0;
  const hours       = timeSummary ? Number(timeSummary.totalHours.toFixed(1)) : null;

  const recentActivity = adminStats?.recentActivity ?? [];

  const displayName = user?.name ?? user?.email ?? '';

  if (projectsLoading && dataLoading) {
    return <div className="tt-page"><Spin size="large" /></div>;
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="tt-page">

      {/* ── Greeting + actions ── */}
      <div className="tt-dashboard-header">
        <div className="tt-dashboard-greeting">
          <span className="tt-dashboard-greeting-label">{getGreeting()}</span>
          <h1 className="tt-dashboard-greeting-name">{displayName}</h1>
        </div>
        <div className="tt-dashboard-actions">
          <Button
            className="tt-dashboard-today-btn"
            icon={<CalendarOutlined />}
            onClick={() => navigate('/time')}
          >
            Сегодня
          </Button>
          <Button
            className="tt-dashboard-new-btn"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/projects')}
          >
            Новая задача
          </Button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="tt-stats-grid">
        <div className="tt-stats-card">
          <AppstoreOutlined className="tt-stats-icon" />
          <div className="tt-stats-value">{projects.length}</div>
          <div className="tt-stats-label">Всего проектов</div>
        </div>
        <div className="tt-stats-card">
          <ThunderboltOutlined className="tt-stats-icon tt-stats-icon--orange" />
          <div className="tt-stats-value">{activeCount}</div>
          <div className="tt-stats-label">Активных задач</div>
        </div>
        <div className="tt-stats-card">
          <ClockCircleOutlined className="tt-stats-icon" />
          <div className="tt-stats-value">{hours ?? '—'}</div>
          <div className="tt-stats-label">Часов всего</div>
        </div>
        <div className="tt-stats-card">
          <BugOutlined className="tt-stats-icon tt-stats-icon--red" />
          <div className="tt-stats-value">{openCount}</div>
          <div className="tt-stats-label">Открытых задач</div>
        </div>
      </div>

      {/* ── Two-column content ── */}
      <div className="tt-dashboard-content">

        {/* Left — Мои задачи */}
        <div className="tt-dashboard-panel tt-dashboard-panel--main">
          <div className="tt-dashboard-panel-header">
            <span className="tt-dashboard-panel-title">Мои задачи</span>
            <Link to="/projects" className="tt-dashboard-panel-link">
              Все задачи <RightOutlined />
            </Link>
          </div>

          {myIssues.length === 0 ? (
            <div className="tt-dashboard-empty">
              {dataLoading ? <Spin /> : 'Нет активных задач'}
            </div>
          ) : (
            <table className="tt-my-issues-table">
              <thead>
                <tr>
                  <th>КЛЮЧ</th>
                  <th>ЗАДАЧА</th>
                  <th>СТАТУС</th>
                  <th>ПРИОРИТЕТ</th>
                </tr>
              </thead>
              <tbody>
                {myIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <Link
                        to={`/issues/${issue.id}`}
                        className="tt-my-issues-key"
                      >
                        {issue.projectKey}-{issue.number}
                      </Link>
                    </td>
                    <td className="tt-my-issues-title">{issue.title}</td>
                    <td>
                      <span className={`tt-status-badge tt-status-badge--${issue.status.toLowerCase().replace('_', '-')}`}>
                        {STATUS_LABEL[issue.status] ?? issue.status}
                      </span>
                    </td>
                    <td>
                      <span className={`tt-priority-text tt-priority-text--${issue.priority.toLowerCase()}`}>
                        {PRIORITY_LABEL[issue.priority] ?? issue.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right — Последние события */}
        <div className="tt-dashboard-panel tt-dashboard-panel--aside">
          <div className="tt-dashboard-panel-header">
            <span className="tt-dashboard-panel-title">Последние события</span>
          </div>

          {recentActivity.length === 0 ? (
            <div className="tt-dashboard-empty">
              {dataLoading ? <Spin /> : 'Нет активности'}
            </div>
          ) : (
            <div className="tt-activity-feed">
              {recentActivity.slice(0, 8).map((entry) => {
                const name = entry.user?.name ?? 'Система';
                const initials = getInitials(name);
                const color = avatarColor(name);
                return (
                  <div key={entry.id} className="tt-activity-item">
                    <div
                      className="tt-activity-avatar"
                      style={{ background: color }}
                    >
                      {initials}
                    </div>
                    <div className="tt-activity-body">
                      <div className="tt-activity-text">
                        <span className="tt-activity-name">{name}</span>
                        {' '}
                        <span className="tt-activity-action">
                          {formatAction(entry.action, entry.entityType)}
                        </span>
                      </div>
                      <div className="tt-activity-time">{timeAgo(entry.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
