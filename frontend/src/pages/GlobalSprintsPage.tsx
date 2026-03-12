import { useEffect, useState, useMemo } from 'react';
import { Typography, Select, Tag, Progress, Card, Space } from 'antd';
import { useAuthStore } from '../store/auth.store';
import type { Project, Sprint, SprintState, Team } from '../types';
import apiClient from '../api/client';
import * as sprintsApi from '../api/sprints';
import * as teamsApi from '../api/teams';

const STATE_COLORS: Record<SprintState, string> = {
  PLANNED: 'default',
  ACTIVE: 'processing',
  CLOSED: 'green',
};

export default function GlobalSprintsPage() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [stateFilter, setStateFilter] = useState<'ALL' | SprintState>('ALL');
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [teamFilter, setTeamFilter] = useState<string | undefined>();

  useEffect(() => {
    async function loadLookups() {
      const [projectsRes, teamsRes] = await Promise.all([
        apiClient.get<Project[]>('/projects'),
        teamsApi.listTeams(),
      ]);
      setProjects(projectsRes.data);
      setTeams(teamsRes);
    }
    loadLookups();
  }, []);

  useEffect(() => {
    async function loadSprints() {
      const data = await sprintsApi.listAllSprints({
        state: stateFilter === 'ALL' ? undefined : stateFilter,
        projectId: projectFilter,
        teamId: teamFilter,
      });
      setSprints(data);
    }
    loadSprints();
  }, [stateFilter, projectFilter, teamFilter]);

  const grouped = useMemo(() => {
    const byState: Record<'PLANNED' | 'ACTIVE' | 'CLOSED', Sprint[]> = {
      PLANNED: [],
      ACTIVE: [],
      CLOSED: [],
    };
    for (const s of sprints) {
      byState[s.state].push(s);
    }
    return byState;
  }, [sprints]);

  const renderSprintCard = (sprint: Sprint) => {
    const projectLabel = sprint.project
      ? `${sprint.project.key} — ${sprint.project.name}`
      : sprint.projectId;

    const readiness = sprint.stats?.planningReadiness ?? 0;

    return (
      <Card
        key={sprint.id}
        size="small"
        className="tt-panel"
        style={{ marginBottom: 8 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Typography.Text strong style={{ color: 'var(--t1)' }}>
                {sprint.name}
              </Typography.Text>
              <Tag color={STATE_COLORS[sprint.state]}>{sprint.state}</Tag>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {projectLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sprint.projectTeam && (
                <span>Проектная команда: {sprint.projectTeam.name}</span>
              )}
              {sprint.businessTeam && (
                <span>Бизнес-функциональная команда: {sprint.businessTeam.name}</span>
              )}
              {sprint.flowTeam && (
                <span>Flow-команда: {sprint.flowTeam.name}</span>
              )}
            </div>
          </div>
          <div style={{ minWidth: 160, textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>Готовность спринта</div>
            <Progress percent={readiness} size="small" />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              {sprint.stats
                ? `${sprint.stats.estimatedIssues}/${sprint.stats.totalIssues} задач с оценкой`
                : 'Нет задач'}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Sprints</h1>
          <p className="tt-page-subtitle">
            Планируемые, активные и закрытые спринты по всем проектам.
          </p>
        </div>
        <div className="tt-page-actions">
          <Typography.Text style={{ fontSize: 12, color: 'var(--t3)' }}>
            {user?.name} ({user?.role})
          </Typography.Text>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Select
          placeholder="Все состояния"
          value={stateFilter}
          onChange={v => setStateFilter(v)}
          style={{ width: 160 }}
          options={[
            { value: 'ALL', label: 'Все состояния' },
            { value: 'PLANNED', label: 'Planned' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'CLOSED', label: 'Closed' },
          ]}
        />
        <Select
          allowClear
          placeholder="Все проекты"
          value={projectFilter}
          onChange={v => setProjectFilter(v)}
          style={{ width: 220 }}
          options={projects.map(p => ({
            value: p.id,
            label: `${p.key} — ${p.name}`,
          }))}
        />
        <Select
          allowClear
          placeholder="Все команды"
          value={teamFilter}
          onChange={v => setTeamFilter(v)}
          style={{ width: 220 }}
          options={teams.map(t => ({
            value: t.id,
            label: t.name,
          }))}
        />
      </div>

      <div className="tt-two-column">
        <div className="tt-two-column-main">
          <div className="tt-panel">
            <div className="tt-panel-header">
              <span>Planned sprints</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                {grouped.PLANNED.length} спринтов
              </span>
            </div>
            <div className="tt-panel-body">
              {grouped.PLANNED.length === 0 ? (
                <div className="tt-panel-empty">Нет планируемых спринтов.</div>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {grouped.PLANNED.map(renderSprintCard)}
                </Space>
              )}
            </div>
          </div>

          <div className="tt-panel" style={{ marginTop: 24 }}>
            <div className="tt-panel-header">
              <span>Active sprints</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                {grouped.ACTIVE.length} спринтов
              </span>
            </div>
            <div className="tt-panel-body">
              {grouped.ACTIVE.length === 0 ? (
                <div className="tt-panel-empty">Нет активных спринтов.</div>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {grouped.ACTIVE.map(renderSprintCard)}
                </Space>
              )}
            </div>
          </div>

          <div className="tt-panel" style={{ marginTop: 24 }}>
            <div className="tt-panel-header">
              <span>Closed sprints</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                {grouped.CLOSED.length} спринтов
              </span>
            </div>
            <div className="tt-panel-body">
              {grouped.CLOSED.length === 0 ? (
                <div className="tt-panel-empty">Нет закрытых спринтов.</div>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {grouped.CLOSED.map(renderSprintCard)}
                </Space>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

