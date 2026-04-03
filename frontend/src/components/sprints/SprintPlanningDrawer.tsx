import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { Button, Drawer, Empty, Spin, Table, Alert, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import * as sprintsApi from '../../api/sprints';
import type { Issue } from '../../types';
import { IssueStatusTag, IssuePriorityTag, IssueTypeBadge } from '../../lib/issue-kit';

type SprintPlanningDrawerProps = {
  open: boolean;
  sprintId: string | null;
  projectId: string | null;
  onClose: () => void;
  onAdded: () => void;
};

function formatIssueKey(issue: Issue) {
  const projectKey = issue.project?.key;
  return projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;
}

export default function SprintPlanningDrawer({
  open,
  sprintId,
  projectId,
  onClose,
  onAdded,
}: SprintPlanningDrawerProps) {
  const [backlog, setBacklog] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !projectId) {
      setBacklog([]);
      setSelectedIds([]);
      setError(null);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const issues = await sprintsApi.getBacklog(projectId);
        if (active) setBacklog(issues.data.filter((i) => i.status !== 'DONE' && i.status !== 'CANCELLED'));
      } catch (err) {
        if (active) {
          const axiosErr = err as AxiosError<{ error?: string }>;
          setError(axiosErr.response?.data?.error ?? 'Не удалось загрузить бэклог');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => { active = false; };
  }, [open, projectId]);

  const handleAdd = async () => {
    if (!sprintId || !selectedIds.length) return;
    try {
      setSubmitting(true);
      await sprintsApi.moveIssuesToSprint(sprintId, selectedIds);
      void message.success(`Добавлено задач: ${selectedIds.length}`);
      setSelectedIds([]);
      onAdded();
      onClose();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      void message.error(axiosErr.response?.data?.error ?? 'Ошибка при добавлении задач');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<Issue> = [
    {
      title: 'Ключ',
      dataIndex: 'number',
      width: 110,
      render: (_value, record) => (
        <Link
          className="tt-issue-id tt-sprint-drawer-key-link"
          to={`/issues/${record.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {formatIssueKey(record)}
        </Link>
      ),
    },
    {
      title: 'Название',
      dataIndex: 'title',
      render: (_value, record) => (
        <span className="tt-sprint-drawer-title-link">{record.title}</span>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'type',
      width: 110,
      render: (_: unknown, record: Issue) => <IssueTypeBadge typeConfig={record.issueTypeConfig} showLabel />,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      width: 140,
      render: (value: Issue['status']) => <IssueStatusTag status={value} size="small" />,
    },
    {
      title: 'Приоритет',
      dataIndex: 'priority',
      width: 120,
      render: (value: Issue['priority']) => <IssuePriorityTag priority={value} size="small" />,
    },
    {
      title: 'Исполнитель',
      dataIndex: ['assignee', 'name'],
      width: 160,
      render: (value?: string) => (
        <span className="tt-sprint-drawer-cell-muted">{value ?? '—'}</span>
      ),
    },
  ];

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <Button onClick={onClose}>Отмена</Button>
      <Button
        type="primary"
        disabled={!selectedIds.length}
        loading={submitting}
        onClick={() => void handleAdd()}
      >
        Добавить в спринт{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
      </Button>
    </div>
  );

  return (
    <Drawer
      rootClassName="tt-sprint-drawer-root"
      className="tt-sprint-drawer"
      title={
        <div className="tt-sprint-drawer-titlebar">
          <span className="tt-sprint-drawer-title-eyebrow">Планирование спринта</span>
          <span className="tt-sprint-drawer-title">Добавить задачи из бэклога</span>
        </div>
      }
      open={open}
      onClose={onClose}
      placement="right"
      width={900}
      push={false}
      footer={footer}
    >
      {loading ? (
        <div className="tt-sprint-drawer-state">
          <Spin />
        </div>
      ) : error ? (
        <Alert className="tt-sprint-drawer-alert" type="error" message={error} showIcon />
      ) : backlog.length === 0 ? (
        <div className="tt-sprint-drawer-empty">
          <Empty description="Бэклог пуст — все задачи уже в спринтах." />
        </div>
      ) : (
        <div className="tt-table tt-sprint-drawer-table">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 760 }}
            columns={columns}
            dataSource={backlog}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys as string[]),
            }}
          />
        </div>
      )}
    </Drawer>
  );
}
