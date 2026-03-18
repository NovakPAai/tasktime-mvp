import { useEffect, useState, useCallback } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import * as projectsApi from '../api/projects';
import type { Project } from '../types';
import type { ProjectDashboard } from '../api/projects';
import { hasAnyRequiredRole } from '../lib/roles';

type FilterType = 'all' | 'active' | 'onhold';

const PROJECT_GRADIENTS = [
  'linear-gradient(135deg,#4F6EF7,#7C3AED)',
  'linear-gradient(135deg,#7C3AED,#EC4899)',
  'linear-gradient(135deg,#F59E0B,#EF4444)',
  'linear-gradient(135deg,#06B6D4,#4F6EF7)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#EF4444,#F59E0B)',
  'linear-gradient(135deg,#8B5CF6,#3B82F6)',
  'linear-gradient(135deg,#F97316,#FBBF24)',
];

function getGradient(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff;
  return PROJECT_GRADIENTS[h % PROJECT_GRADIENTS.length];
}

function getInitials(key: string): string {
  return key.slice(0, 2).toUpperCase();
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'сегодня';
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн. назад`;
  if (d < 30) return `${Math.floor(d / 7)} нед. назад`;
  return `${Math.floor(d / 30)} мес. назад`;
}

interface CardData {
  project: Project;
  dashboard: ProjectDashboard | null;
  loading: boolean;
}

export default function ProjectsPage() {
  const { projects, loading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [cards, setCards] = useState<CardData[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  const canCreate = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const loadDashboards = useCallback(async (ps: Project[]) => {
    setCards(ps.map((p) => ({ project: p, dashboard: null, loading: true })));
    const results = await Promise.allSettled(
      ps.map((p) => projectsApi.getProjectDashboard(p.id)),
    );
    setCards(
      ps.map((p, i) => ({
        project: p,
        dashboard: results[i].status === 'fulfilled' ? results[i].value : null,
        loading: false,
      })),
    );
  }, []);

  useEffect(() => {
    if (projects.length > 0) loadDashboards(projects);
  }, [projects, loadDashboards]);

  const handleCreate = async (values: { name: string; key: string; description?: string }) => {
    try {
      await projectsApi.createProject(values);
      message.success('Проект создан');
      setModalOpen(false);
      form.resetFields();
      fetchProjects();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Ошибка создания проекта');
    }
  };

  const getStatus = (d: ProjectDashboard | null): 'active' | 'onhold' | 'empty' => {
    if (!d) return 'active';
    if (d.activeSprint) return 'active';
    if (d.totals.totalIssues === 0) return 'empty';
    return 'onhold';
  };

  const filteredCards = cards.filter(({ dashboard }) => {
    if (filter === 'all') return true;
    const s = getStatus(dashboard);
    if (filter === 'active') return s === 'active';
    if (filter === 'onhold') return s === 'onhold' || s === 'empty';
    return true;
  });

  const activeCount = cards.filter(({ dashboard }) => getStatus(dashboard) === 'active').length;

  return (
    <div className="tt-page tt-projects-page">
      {/* Header */}
      <div className="tt-projects-header">
        <div>
          <h1 className="tt-projects-title">Projects</h1>
          <span className="tt-projects-subtitle">
            {loading ? '…' : `${projects.length} projects · ${activeCount} active`}
          </span>
        </div>
        <div className="tt-projects-header-right">
          <div className="tt-projects-search">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M9 9L12 12"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span>Search projects…</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tt-projects-filters">
        {(
          [
            ['all', 'All'],
            ['active', 'Active'],
            ['onhold', 'On Hold'],
          ] as [FilterType, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`tt-projects-filter-tab${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {key !== 'all' && (
              <span
                className="tt-projects-filter-dot"
                style={{ background: key === 'active' ? '#22C55E' : '#F59E0B' }}
              />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      <div className="tt-projects-grid">
        {loading && cards.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tt-project-card tt-project-card--skeleton" />
            ))
          : filteredCards.map(({ project, dashboard, loading: cardLoading }) => {
              const total = dashboard?.totals.totalIssues ?? project._count?.issues ?? 0;
              const done = dashboard?.totals.doneIssues ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const sprint = dashboard?.activeSprint;
              const status = getStatus(dashboard);
              const gradient = getGradient(project.key);

              return (
                <div
                  key={project.id}
                  className={`tt-project-card${status === 'empty' ? ' tt-project-card--dim' : ''}`}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="tt-project-card-glow" style={{ background: gradient }} />

                  <div className="tt-project-card-head">
                    <div className="tt-project-card-id">
                      <div className="tt-project-avatar" style={{ background: gradient }}>
                        {getInitials(project.key)}
                      </div>
                      <div>
                        <div className="tt-project-card-name">{project.name}</div>
                        <div className="tt-project-card-key">{project.key}</div>
                      </div>
                    </div>
                    {!cardLoading && (
                      <span className={`tt-project-status-badge tt-project-status-badge--${status}`}>
                        <span className="tt-project-status-dot" />
                        {status === 'active' ? 'Active' : status === 'onhold' ? 'On Hold' : 'Empty'}
                      </span>
                    )}
                  </div>

                  <p className="tt-project-card-desc">
                    {project.description || 'No description yet.'}
                  </p>

                  <div className="tt-project-metrics">
                    <div className="tt-project-metric">
                      <span className="tt-project-metric-value">{total}</span>
                      <span className="tt-project-metric-label">issues</span>
                    </div>
                    <div className="tt-project-metric-sep" />
                    <div className="tt-project-metric">
                      <span className="tt-project-metric-value tt-project-metric-value--muted">
                        {sprint ? sprint.name : 'Backlog'}
                      </span>
                      <span className="tt-project-metric-label">
                        {sprint ? 'active sprint' : 'no sprint'}
                      </span>
                    </div>
                    <div className="tt-project-metric-sep" />
                    <div className="tt-project-metric">
                      <span
                        className="tt-project-metric-value"
                        style={{
                          background: gradient,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        {pct}%
                      </span>
                      <span className="tt-project-metric-label">done</span>
                    </div>
                  </div>

                  <div className="tt-project-progress-track">
                    <div
                      className="tt-project-progress-fill"
                      style={{ width: `${pct}%`, background: gradient }}
                    />
                  </div>

                  <div className="tt-project-card-footer">
                    <div
                      className="tt-project-avatar tt-project-avatar--sm"
                      style={{ background: gradient }}
                    >
                      {getInitials(project.key)}
                    </div>
                    <span className="tt-project-card-time">
                      {formatRelativeTime(project.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}

        {canCreate && !loading && (
          <div
            className="tt-project-card tt-project-card--new"
            onClick={() => setModalOpen(true)}
          >
            <div className="tt-project-card-new-inner">
              <div className="tt-project-card-new-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <line
                    x1="10"
                    y1="3"
                    x2="10"
                    y2="17"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1="3"
                    y1="10"
                    x2="17"
                    y2="10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span>New Project</span>
            </div>
          </div>
        )}
      </div>

      <Modal
        title="New Project"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Create"
        className="tt-modal"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Core Platform" />
          </Form.Item>
          <Form.Item
            name="key"
            label="Key"
            rules={[
              {
                required: true,
                pattern: /^[A-Z][A-Z0-9]*$/,
                message: 'Uppercase letters/digits, starting with letter',
              },
            ]}
            extra="e.g. PROJ, BACK, FRONT"
          >
            <Input placeholder="PROJ" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="What is this project about?" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
