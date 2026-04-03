import { useEffect, useState } from 'react';
import { Select, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import * as releasesApi from '../api/releases';
import type { Project, Release } from '../types';

const STATE_LABEL: Record<string, string> = {
  DRAFT: 'Черновик',
  READY: 'Готов к выпуску',
  RELEASED: 'Выпущен',
};

const STATE_TONE: Record<string, string> = {
  DRAFT: 'default',
  READY: 'processing',
  RELEASED: 'success',
};

interface ProjectRelease {
  project: Project;
  releases: Release[];
}

export default function GlobalReleasesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [data, setData] = useState<ProjectRelease[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get<Project[]>('/projects').then((r) => setProjects(r.data));
  }, []);

  useEffect(() => {
    if (!projects.length) return;
    setLoading(true);
    Promise.all(
      projects.map((p) =>
        releasesApi.listReleases(p.id)
          .then((releases) => ({ project: p, releases }))
          .catch(() => ({ project: p, releases: [] as Release[] })),
      ),
    )
      .then((results) => setData(results.filter((r) => r.releases.length > 0)))
      .finally(() => setLoading(false));
  }, [projects]);

  const filtered = data.map((pr) => ({
    ...pr,
    releases: filter === 'ALL' ? pr.releases : pr.releases.filter((r) => r.state === filter),
  })).filter((pr) => pr.releases.length > 0);

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Релизы</h1>
          <p className="tt-page-subtitle">Все релизы по всем проектам</p>
        </div>
      </div>

      <div className="tt-filters-row" style={{ marginBottom: 16 }}>
        <Select
          value={filter}
          onChange={setFilter}
          style={{ width: 180 }}
          options={[
            { value: 'ALL', label: 'Все состояния' },
            { value: 'DRAFT', label: 'Черновик' },
            { value: 'READY', label: 'Готов к выпуску' },
            { value: 'RELEASED', label: 'Выпущен' },
          ]}
        />
      </div>

      {loading ? (
        <div className="tt-panel-empty">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="tt-panel-empty">Нет релизов.</div>
      ) : (
        filtered.map(({ project, releases }) => (
          <div key={project.id} className="tt-panel" style={{ marginBottom: 16 }}>
            <div className="tt-panel-header">
              <span>
                <span className="tt-mono" style={{ color: 'var(--acc)', marginRight: 8 }}>
                  {project.key}
                </span>
                {project.name}
              </span>
              <Link to={`/projects/${project.id}/releases`} style={{ fontSize: 11, color: 'var(--acc)' }}>
                Все релизы →
              </Link>
            </div>
            <div className="tt-panel-body" style={{ padding: 0 }}>
              {releases.map((r) => (
                <div key={r.id} className="tt-panel-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography.Text style={{ fontWeight: 500, color: 'var(--t1)' }}>{r.name}</Typography.Text>
                    <Tag color={r.level === 'MAJOR' ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
                      {r.level === 'MAJOR' ? 'Мажорный' : 'Минорный'}
                    </Tag>
                    <Tag color={STATE_TONE[r.state]} style={{ marginInlineEnd: 0 }}>
                      {STATE_LABEL[r.state]}
                    </Tag>
                  </div>
                  <Link to={`/projects/${project.id}/releases`} style={{ fontSize: 12, color: 'var(--t3)' }}>
                    Открыть
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
