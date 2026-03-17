import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { Alert, Drawer, Empty, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import IssuePreviewDrawer from '../issues/IssuePreviewDrawer';
import * as sprintsApi from '../../api/sprints';
import type { Issue, Sprint, SprintDetailsResponse } from '../../types';

type SprintIssuesDrawerProps = {
  open: boolean;
  sprintId: string | null;
  onClose: () => void;
};

const STATE_TONE_CLASS: Record<Sprint['state'], string> = {
  PLANNED: 'planned',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

const TYPE_TONE_CLASS: Record<Issue['type'], string> = {
  EPIC: 'epic',
  STORY: 'story',
  TASK: 'task',
  SUBTASK: 'subtask',
  BUG: 'bug',
};

const STATUS_TONE_CLASS: Record<Issue['status'], string> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

const STATE_LABEL_RU: Record<Sprint['state'], string> = {
  PLANNED: 'Планируется',
  ACTIVE: 'Активен',
  CLOSED: 'Закрыт',
};

const STATUS_LABEL_RU: Record<Issue['status'], string> = {
  OPEN: 'Открыта',
  IN_PROGRESS: 'В работе',
  REVIEW: 'Ревью',
  DONE: 'Готово',
  CANCELLED: 'Отменена',
};

const TYPE_LABEL_RU: Record<Issue['type'], string> = {
  EPIC: 'Эпик',
  STORY: 'История',
  TASK: 'Задача',
  SUBTASK: 'Подзадача',
  BUG: 'Ошибка',
};

const PRIORITY_LABEL_RU: Record<Issue['priority'], string> = {
  CRITICAL: 'Критичный',
  HIGH: 'Высокий',
  MEDIUM: 'Средний',
  LOW: 'Низкий',
};

function formatIssueKey(issue: Issue) {
  const projectKey = issue.project?.key;
  return projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatDateRange(sprint: Sprint) {
  const start = sprint.startDate ? formatDateTime(sprint.startDate) : null;
  const end = sprint.endDate ? formatDateTime(sprint.endDate) : null;

  if (!start && !end) return 'Даты не заданы';
  if (start && end) return `${start} — ${end}`;
  if (start) return `${start} → без окончания`;
  return `до ${end}`;
}

export default function SprintIssuesDrawer({ open, sprintId, onClose }: SprintIssuesDrawerProps) {
  const [data, setData] = useState<SprintDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sprintId) {
      setLoading(false);
      setError(null);
      setSelectedIssueId(null);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setData(null);
        const nextData = await sprintsApi.getSprintIssues(sprintId);
        if (active) {
          setData(nextData);
        }
      } catch (err) {
        if (active) {
          const requestError = err as AxiosError<{ error?: string }>;
          setError(requestError.response?.data?.error || 'Failed to load sprint details');
          setData(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [open, sprintId]);

  const columns: ColumnsType<Issue> = [
    {
      title: 'Ключ',
      dataIndex: 'number',
      width: 110,
      render: (_value, record) => (
        <Link
          className="tt-issue-id tt-sprint-drawer-key-link"
          to={`/issues/${record.id}`}
          onClick={(event) => event.stopPropagation()}
        >
          {formatIssueKey(record)}
        </Link>
      ),
    },
    {
      title: 'Название',
      dataIndex: 'title',
      width: 320,
      render: (_value, record) => (
        <button
          type="button"
          className="tt-sprint-drawer-title-link tt-sprint-drawer-title-button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedIssueId(record.id);
          }}
        >
          {record.title}
        </button>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'type',
      width: 110,
      render: (value: Issue['type']) => (
        <span className={`tt-issue-tag tt-sprint-drawer-type-pill tt-sprint-drawer-type-${TYPE_TONE_CLASS[value]}`}>
          {TYPE_LABEL_RU[value]}
        </span>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      width: 140,
      render: (value: Issue['status']) => (
        <span className={`tt-sprint-drawer-status-pill tt-sprint-drawer-status-pill-${STATUS_TONE_CLASS[value]}`}>
          {STATUS_LABEL_RU[value]}
        </span>
      ),
    },
    {
      title: 'Приоритет',
      dataIndex: 'priority',
      width: 120,
      render: (value: Issue['priority']) => (
        <span className={`tt-priority-pill tt-priority-${value.toLowerCase()}`}>
          <span className="tt-priority-dot" />
          <span>{PRIORITY_LABEL_RU[value]}</span>
        </span>
      ),
    },
    {
      title: 'Исполнитель',
      dataIndex: ['assignee', 'name'],
      width: 160,
      render: (value?: string) => <span className="tt-sprint-drawer-cell-muted">{value || '—'}</span>,
    },
    {
      title: 'Обновлено',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string) => <span className="tt-sprint-drawer-cell-muted">{formatDateTime(value)}</span>,
    },
  ];

  const sprint = data?.sprint;
  const drawerTitle = sprint ? sprint.name : 'Детали спринта';

  return (
    <Drawer
      rootClassName="tt-sprint-drawer-root"
      className="tt-sprint-drawer"
      title={
        <div className="tt-sprint-drawer-titlebar">
          <span className="tt-sprint-drawer-title-eyebrow">Детали спринта</span>
          <span className="tt-sprint-drawer-title">{drawerTitle}</span>
        </div>
      }
      open={open}
      onClose={() => {
        setSelectedIssueId(null);
        onClose();
      }}
      placement="right"
      width={900}
      push={false}
      destroyOnClose={false}
    >
      {loading ? (
        <div className="tt-sprint-drawer-state">
          <Spin />
        </div>
      ) : error ? (
        <Alert className="tt-sprint-drawer-alert" type="error" message={error} showIcon />
      ) : !sprint ? (
        <div className="tt-sprint-drawer-empty">
          <Empty description="Выберите спринт, чтобы увидеть детали." />
        </div>
      ) : (
        <div className="tt-sprint-drawer-body">
          <section className="tt-panel tt-sprint-drawer-summary">
            <div className="tt-panel-header">
              <span>Обзор спринта</span>
            </div>
            <div className="tt-panel-body tt-sprint-drawer-summary-body">
              <div className="tt-sprint-drawer-summary-main">
                <div className="tt-sprint-drawer-summary-top">
                  <div className="tt-sprint-drawer-summary-title-wrap">
                    <Typography.Title level={4} className="tt-sprint-drawer-summary-title">
                      {sprint.name}
                    </Typography.Title>
                    {sprint.project && (
                      <Typography.Text type="secondary" className="tt-sprint-drawer-summary-project">
                        {sprint.project.key} - {sprint.project.name}
                      </Typography.Text>
                    )}
                  </div>
                  <span className={`tt-sprint-state-pill tt-sprint-state-pill-${STATE_TONE_CLASS[sprint.state]}`}>
                    {STATE_LABEL_RU[sprint.state]}
                  </span>
                </div>

                <Typography.Text type="secondary" className="tt-sprint-drawer-summary-dates">
                  {formatDateRange(sprint)}
                </Typography.Text>

                {sprint.goal ? (
                  <Typography.Paragraph className="tt-sprint-drawer-summary-goal">
                    {sprint.goal}
                  </Typography.Paragraph>
                ) : (
                  <Typography.Text type="secondary" className="tt-sprint-drawer-summary-goal-muted">
                    Цель спринта не задана.
                  </Typography.Text>
                )}
              </div>

              <div className="tt-sprint-drawer-metrics">
                <div className="tt-sprint-drawer-metric-card">
                  <span className="tt-sprint-drawer-metric-label">Задач в спринте</span>
                  <span className="tt-sprint-drawer-metric-value">{data.issues.length}</span>
                </div>
                <div className="tt-sprint-drawer-metric-card">
                  <span className="tt-sprint-drawer-metric-label">Период</span>
                  <span className="tt-sprint-drawer-metric-text">{formatDateRange(sprint)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="tt-panel">
            <div className="tt-panel-header">
              <span>Задачи в спринте</span>
              <span className="tt-sprint-drawer-table-count">{data.issues.length}</span>
            </div>
            <div className="tt-panel-body">
              {data.issues.length === 0 ? (
                <div className="tt-sprint-drawer-empty">
                  <Empty description="В спринте пока нет задач." />
                </div>
              ) : (
                <div className="tt-table tt-sprint-drawer-table">
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    tableLayout="fixed"
                    scroll={{ x: 980 }}
                    columns={columns}
                    dataSource={data.issues}
                    onRow={(record) => ({
                      onClick: () => setSelectedIssueId(record.id),
                    })}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <IssuePreviewDrawer
        open={open && !!selectedIssueId}
        issueId={selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
      />
    </Drawer>
  );
}
