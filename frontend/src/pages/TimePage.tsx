import { useEffect, useMemo, useState } from 'react';
import { Typography, Table, Card, Space, Button, message, Select } from 'antd';
import { ClockCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as timeApi from '../api/time';
import { useAuthStore } from '../store/auth.store';
import type { TimeLog, UserTimeSummary } from '../types';

function emptySummary(userId?: string): UserTimeSummary {
  return {
    userId: userId ?? '',
    humanHours: 0,
    agentHours: 0,
    totalHours: 0,
    agentCost: 0,
  };
}

function getBusinessDateText(logDate: string): string {
  return logDate.slice(0, 10);
}

function getBusinessDate(logDate: string): Date {
  return new Date(`${getBusinessDateText(logDate)}T00:00:00`);
}

export default function TimePage() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [summary, setSummary] = useState<UserTimeSummary>(emptySummary());
  const [active, setActive] = useState<TimeLog | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [period, setPeriod] = useState<'all' | 'today' | 'week' | 'month'>('week');
  const [projectKey, setProjectKey] = useState<string | 'all'>('all');

  const loadUserLogs = async (userId: string) => {
    try {
      const nextLogs = await timeApi.getUserLogs(userId);
      setLogs(nextLogs);
    } catch {
      message.error('Failed to load time logs');
    }
  };

  const loadUserSummary = async (userId: string) => {
    try {
      const nextSummary = await timeApi.getUserTimeSummary(userId);
      setSummary(nextSummary);
    } catch {
      setSummary(emptySummary(userId));
      message.error('Failed to load time summary');
    }
  };

  useEffect(() => {
    if (user) {
      setSummary(emptySummary(user.id));
      void loadUserLogs(user.id);
      void loadUserSummary(user.id);
      void timeApi.getActiveTimer().then(setActive);
    }
  }, [user]);

  // Live timer
  useEffect(() => {
    if (!active?.startedAt) return;
    const iv = setInterval(() => {
      const diff = Date.now() - new Date(active.startedAt!).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [active]);

  const handleStop = async () => {
    if (!active) return;
    try {
      await timeApi.stopTimer(active.issueId);
      setActive(null);
      if (user) {
        await Promise.all([
          loadUserLogs(user.id),
          loadUserSummary(user.id),
        ]);
      }
      message.success('Timer stopped');
    } catch { message.error('Error'); }
  };

  const filteredLogs = useMemo(() => {
    const now = new Date();
    let from: Date | null = null;

    if (period === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return logs.filter((log) => {
      if (from) {
        const businessDate = getBusinessDate(log.logDate);
        if (businessDate < from) return false;
      }
      if (projectKey !== 'all') {
        const key = log.issue?.project?.key;
        if (!key || key !== projectKey) return false;
      }
      return true;
    });
  }, [logs, period, projectKey]);

  const projectOptions = useMemo(() => {
    const keys = Array.from(
      new Set(
        logs
          .map((l) => l.issue?.project?.key)
          .filter((k): k is string => Boolean(k)),
      ),
    ).sort();
    return keys.map((key) => ({ label: key, value: key }));
  }, [logs]);

  const columns = [
    {
      title: 'Issue',
      key: 'issue',
      render: (_: unknown, r: TimeLog) =>
        r.issue ? (
          <Link to={`/issues/${r.issue.id}`}>
            <span className="tt-mono">
              {r.issue.project?.key}-{r.issue.number}
            </span>{' '}
            {r.issue.title}
          </Link>
        ) : (
          '-'
        ),
    },
    {
      title: 'Hours',
      dataIndex: 'hours',
      width: 90,
      render: (h: number) => <span className="tt-mono">{Number(h).toFixed(2)}</span>,
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 90,
      render: (src: TimeLog['source']) =>
        src === 'AGENT' ? (
          <span className="tt-badge tt-badge-purple">AI</span>
        ) : (
          <span className="tt-badge tt-badge-blue">Human</span>
        ),
    },
    {
      title: 'Model',
      key: 'model',
      width: 140,
      render: (_: unknown, r: TimeLog) =>
        r.source === 'AGENT' && r.agentSession
          ? `${r.agentSession.model}`
          : '-',
    },
    {
      title: 'AI Cost',
      dataIndex: 'costMoney',
      width: 90,
      render: (c: number | null | undefined, r: TimeLog) =>
        r.source === 'AGENT' && c != null ? (
          <span className="tt-mono">{Number(c).toFixed(4)}</span>
        ) : (
          '-'
        ),
    },
    { title: 'Note', dataIndex: 'note', width: 200, render: (n: string) => n || '-' },
    {
      title: 'Date',
      dataIndex: 'logDate',
      width: 120,
      render: (d: string) => {
        return <span className="tt-mono">{getBusinessDateText(d)}</span>;
      },
    },
  ];

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">My Time</h1>
          <p className="tt-page-subtitle">Review and filter your logged work</p>
        </div>
      </div>

      <div className="tt-filters-row">
        <div className="tt-filter-group">
          <span className="tt-filter-label">Period</span>
          <div className="tt-filter-pills">
            <button
              type="button"
              className={`tt-filter-pill ${period === 'today' ? 'tt-filter-pill-active' : ''}`}
              onClick={() => setPeriod('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`tt-filter-pill ${period === 'week' ? 'tt-filter-pill-active' : ''}`}
              onClick={() => setPeriod('week')}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className={`tt-filter-pill ${period === 'month' ? 'tt-filter-pill-active' : ''}`}
              onClick={() => setPeriod('month')}
            >
              Last 30 days
            </button>
            <button
              type="button"
              className={`tt-filter-pill ${period === 'all' ? 'tt-filter-pill-active' : ''}`}
              onClick={() => setPeriod('all')}
            >
              All time
            </button>
          </div>
        </div>

        <div className="tt-filter-group">
          <span className="tt-filter-label">Project</span>
          <Select
            size="small"
            className="tt-filter-select"
            placeholder="All projects"
            value={projectKey}
            style={{ minWidth: 140 }}
            onChange={(value) => setProjectKey(value)}
            options={[
              { label: 'All projects', value: 'all' },
              ...projectOptions,
            ]}
          />
        </div>
      </div>

      {active && (
        <Card size="small" style={{ marginBottom: 16, borderColor: 'var(--acc)', background: 'rgba(79,110,247,0.06)' }}>
          <Space>
            <ClockCircleOutlined style={{ color: 'var(--acc)', fontSize: 20 }} />
            <Typography.Text strong style={{ fontSize: 24, fontFamily: 'var(--font-display)', color: 'var(--t1)' }}>{elapsed}</Typography.Text>
            {active.issue && <Link to={`/issues/${active.issue.id}`}>{active.issue.project?.key}-{active.issue.number} {active.issue.title}</Link>}
            <Button icon={<PauseCircleOutlined />} danger onClick={handleStop}>Stop</Button>
          </Space>
        </Card>
      )}

      <div style={{ marginBottom: 12 }}>
        <Typography.Title level={5} style={{ marginBottom: 4 }}>
          All-time summary
        </Typography.Title>
        <Typography.Text type="secondary">
          Filters below affect the log table only.
        </Typography.Text>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          marginBottom: 16,
        }}
      >
        <Card size="small" data-testid="time-summary-human">
          <Typography.Text type="secondary">Human</Typography.Text>
          <div className="tt-mono" style={{ fontSize: 24, marginTop: 8 }}>
            {summary.humanHours.toFixed(2)}h
          </div>
        </Card>
        <Card size="small" data-testid="time-summary-ai">
          <Typography.Text type="secondary">AI</Typography.Text>
          <div className="tt-mono" style={{ fontSize: 24, marginTop: 8 }}>
            {summary.agentHours.toFixed(2)}h
          </div>
        </Card>
        <Card size="small" data-testid="time-summary-ai-cost">
          <Typography.Text type="secondary">AI cost</Typography.Text>
          <div className="tt-mono" style={{ fontSize: 24, marginTop: 8 }}>
            {summary.agentCost.toFixed(4)}
          </div>
        </Card>
        <Card size="small" data-testid="time-summary-total">
          <Typography.Text type="secondary">Total</Typography.Text>
          <div className="tt-mono" style={{ fontSize: 24, marginTop: 8 }}>
            {summary.totalHours.toFixed(2)}h
          </div>
        </Card>
      </div>

      <div className="tt-time-summary-row">
        <span className="tt-time-summary-label">Visible log entries</span>
        <span className="tt-time-summary-value tt-mono">{filteredLogs.length}</span>
        {filteredLogs.length !== logs.length && (
          <span className="tt-time-summary-muted">
            ({filteredLogs.length} of {logs.length} entries)
          </span>
        )}
      </div>

      <div className="tt-table tt-time-table">
        <Table
          dataSource={filteredLogs}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </div>
    </div>
  );
}
