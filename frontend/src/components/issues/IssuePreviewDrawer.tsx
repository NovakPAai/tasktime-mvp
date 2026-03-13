import { useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { Alert, Button, Drawer, Empty, List, Spin, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as issuesApi from '../../api/issues';
import type { Issue } from '../../types';

type IssuePreviewDrawerProps = {
  open: boolean;
  issueId: string | null;
  onClose: () => void;
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

const STATUS_TONE_CLASS: Record<Issue['status'], string> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

const TYPE_TONE_CLASS: Record<Issue['type'], string> = {
  EPIC: 'epic',
  STORY: 'story',
  TASK: 'task',
  SUBTASK: 'subtask',
  BUG: 'bug',
};

function formatIssueKey(issue: Issue) {
  const projectKey = issue.project?.key;
  return projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;
}

function formatDate(value?: string) {
  if (!value) return 'Не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Не указано';
  return date.toLocaleDateString();
}

export default function IssuePreviewDrawer({ open, issueId, onClose }: IssuePreviewDrawerProps) {
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !issueId) {
      setIssue(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setIssue(null);
        const data = await issuesApi.getIssue(issueId);
        if (active) {
          setIssue(data);
        }
      } catch (err) {
        if (active) {
          const requestError = err as AxiosError<{ error?: string }>;
          setError(requestError.response?.data?.error || 'Не удалось загрузить детали задачи');
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
  }, [open, issueId]);

  const issueKey = useMemo(() => (issue ? formatIssueKey(issue) : ''), [issue]);

  return (
    <Drawer
      rootClassName="tt-issue-preview-drawer-root"
      className="tt-issue-preview-drawer"
      title={
        <div className="tt-sprint-drawer-titlebar">
          <span className="tt-sprint-drawer-title-eyebrow">Детали задачи</span>
          <span className="tt-sprint-drawer-title">{issue?.title || 'Предпросмотр задачи'}</span>
        </div>
      }
      placement="right"
      width={860}
      open={open}
      onClose={onClose}
      mask={false}
      destroyOnClose={false}
    >
      {loading ? (
        <div className="tt-sprint-drawer-state">
          <Spin />
        </div>
      ) : error ? (
        <Alert className="tt-sprint-drawer-alert" type="error" message={error} showIcon />
      ) : !issue ? (
        <div className="tt-sprint-drawer-empty">
          <Empty description="Выберите задачу, чтобы увидеть детали." />
        </div>
      ) : (
        <div className="tt-issue-preview-body">
          <header className="tt-issue-preview-header">
            <div className="tt-issue-header-main">
              <div className="tt-issue-breadcrumbs">
                <span>{issue.project?.name || 'Проект'}</span>
                <span className="tt-issue-breadcrumb-sep">/</span>
                <span>{issueKey}</span>
              </div>
              <div className="tt-issue-title-row">
                <h2 className="tt-page-title">{issue.title}</h2>
                <div className="tt-issue-id-badge">
                  <span>{issueKey}</span>
                </div>
                <span className={`tt-issue-tag tt-sprint-drawer-type-pill tt-sprint-drawer-type-${TYPE_TONE_CLASS[issue.type]}`}>
                  {TYPE_LABEL_RU[issue.type]}
                </span>
              </div>
              <div className="tt-issue-header-meta">
                <span>Создана: {formatDate(issue.createdAt)}</span>
                <span>Автор: {issue.creator?.name || 'Не указан'}</span>
              </div>
            </div>
            <div className="tt-issue-preview-actions">
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => navigate(`/issues/${issue.id}`)}
              >
                Редактировать
              </Button>
            </div>
          </header>

          <div className="tt-issue-main tt-issue-preview-main">
            <div className="tt-issue-main-body">
              <section>
                <h3 className="tt-issue-section-title">Описание</h3>
                {issue.description ? (
                  <div className="tt-issue-description">
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.description}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <Typography.Text type="secondary">Описание не заполнено.</Typography.Text>
                )}
              </section>

              <section>
                <h3 className="tt-issue-section-title">Связи</h3>
                <div className="tt-panel">
                  <div className="tt-panel-body">
                    <div className="tt-panel-row">
                      <span>Родитель</span>
                      <span className="tt-aside-value">
                        {issue.parent ? `${issue.parent.type}-${issue.parent.number}: ${issue.parent.title}` : 'Нет'}
                      </span>
                    </div>
                    <div className="tt-panel-row">
                      <span>Подзадачи</span>
                      <span className="tt-aside-value">{issue.children?.length ?? 0}</span>
                    </div>
                  </div>
                </div>
              </section>

              {issue.children && issue.children.length > 0 && (
                <section>
                  <h3 className="tt-issue-section-title">Подзадачи</h3>
                  <List
                    size="small"
                    className="tt-issue-subissues-list"
                    dataSource={issue.children}
                    renderItem={(child) => (
                      <List.Item>
                        <div className="tt-issue-preview-subissue">
                          <div className="tt-issue-preview-subissue-top">
                            <Tag>{child.type}</Tag>
                            <span className={`tt-sprint-drawer-status-pill tt-sprint-drawer-status-pill-${STATUS_TONE_CLASS[child.status]}`}>
                              {STATUS_LABEL_RU[child.status]}
                            </span>
                          </div>
                          <span>{child.title}</span>
                        </div>
                      </List.Item>
                    )}
                  />
                </section>
              )}
            </div>

            <aside className="tt-issue-main-aside tt-issue-preview-aside">
              <div className="tt-panel">
                <div className="tt-panel-header">Поля</div>
                <div className="tt-panel-body tt-issue-preview-fields">
                  <div className="tt-panel-row">
                    <span>Статус</span>
                    <span className={`tt-sprint-drawer-status-pill tt-sprint-drawer-status-pill-${STATUS_TONE_CLASS[issue.status]}`}>
                      {STATUS_LABEL_RU[issue.status]}
                    </span>
                  </div>
                  <div className="tt-panel-row">
                    <span>Приоритет</span>
                    <span className={`tt-priority-pill tt-priority-${issue.priority.toLowerCase()}`}>
                      <span className="tt-priority-dot" />
                      <span>{PRIORITY_LABEL_RU[issue.priority]}</span>
                    </span>
                  </div>
                  <div className="tt-panel-row">
                    <span>Тип</span>
                    <span className={`tt-issue-tag tt-sprint-drawer-type-pill tt-sprint-drawer-type-${TYPE_TONE_CLASS[issue.type]}`}>
                      {TYPE_LABEL_RU[issue.type]}
                    </span>
                  </div>
                  <div className="tt-panel-row">
                    <span>Исполнитель</span>
                    <span className="tt-aside-value">{issue.assignee?.name || 'Не назначен'}</span>
                  </div>
                  <div className="tt-panel-row">
                    <span>Проект</span>
                    <span className="tt-aside-value">{issue.project?.key || '—'}</span>
                  </div>
                  <div className="tt-panel-row">
                    <span>Ключ</span>
                    <span className="tt-aside-value tt-aside-mono">{issueKey}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}
    </Drawer>
  );
}
