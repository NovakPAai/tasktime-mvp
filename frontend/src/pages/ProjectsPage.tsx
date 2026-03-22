import { useEffect, useState, useCallback } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import * as projectsApi from '../api/projects';
import type { Project } from '../types';
import type { ProjectDashboard } from '../api/projects';
import { hasAnyRequiredRole } from '../lib/roles';
import { ProjectCard } from '../components/ui';
import type { ProjectCardData, ProjectStatus } from '../components/ui';

type FilterType = 'all' | 'active' | 'onhold' | 'archived';


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

  const getStatus = (d: ProjectDashboard | null): ProjectStatus => {
    if (!d) return 'active';
    if (d.activeSprint) return 'active';
    if (d.totals.totalIssues === 0) return 'archived';
    return 'onhold';
  };

  const filteredCards = cards.filter(({ dashboard }) => {
    if (filter === 'all') return true;
    const s = getStatus(dashboard);
    if (filter === 'active') return s === 'active';
    if (filter === 'onhold') return s === 'onhold';
    if (filter === 'archived') return s === 'archived';
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
          {canCreate && (
            <button
              className="tt-projects-create-btn"
              onClick={() => setModalOpen(true)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New Project
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tt-projects-filters">
        {(
          [
            ['all', 'All', null],
            ['active', 'Active', '#22C55E'],
            ['onhold', 'On Hold', '#F59E0B'],
            ['archived', 'Archived', '#6b7280'],
          ] as [FilterType, string, string | null][]
        ).map(([key, label, dotColor]) => (
          <button
            key={key}
            className={`tt-projects-filter-tab${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {dotColor && (
              <span className="tt-projects-filter-dot" style={{ background: dotColor }} />
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
          : filteredCards.map(({ project, dashboard }) => {
              const total = dashboard?.totals.totalIssues ?? project._count?.issues ?? 0;
              const done = dashboard?.totals.doneIssues ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const sprint = dashboard?.activeSprint;
              const status = getStatus(dashboard);

              const cardData: ProjectCardData = {
                id: project.id,
                name: project.name,
                key: project.key,
                description: project.description,
                status,
                openIssues: total - done,
                currentSprint: sprint?.name ?? null,
                completionPct: pct,
                updatedAt: project.updatedAt,
              };

              return (
                <ProjectCard
                  key={project.id}
                  project={cardData}
                  onClick={() => navigate(`/projects/${project.id}`)}
                />
              );

            })}
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
