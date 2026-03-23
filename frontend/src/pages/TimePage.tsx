/**
 * TimePage — Учёт времени
 * Дизайн: Paper артборд "Time — Dark" (2RY-0)
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Form, Input, InputNumber, DatePicker, Select, message } from 'antd';
import { PlusOutlined, PauseCircleOutlined, StopOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as timeApi from '../api/time';
import { useAuthStore } from '../store/auth.store';
import type { TimeLog } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function smartDate(logDate: string): string {
  const d = new Date(`${logDate.slice(0, 10)}T00:00:00`);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const logStr = logDate.slice(0, 10);

  if (logStr === todayStr) return 'Сегодня';
  if (logStr === yesterdayStr) return 'Вчера';

  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()] ?? ''}`;
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
  'var(--acc)', 'var(--lbl-imp)', 'var(--lbl-perf)', 'var(--s-inprog)',
  'var(--s-urgent)', 'var(--lbl-feat)', 'var(--acc-h)', '#ec4899',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function getBusinessDateText(logDate: string): string {
  return logDate.slice(0, 10);
}

function getBusinessDate(logDate: string): Date {
  return new Date(`${getBusinessDateText(logDate)}T00:00:00`);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TimePage() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [active, setActive] = useState<TimeLog | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [period, setPeriod] = useState<'all' | 'today' | 'week' | 'month'>('week');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm] = Form.useForm();
  const [projectKey, setProjectKey] = useState<string | 'all'>('all');

  const loadUserLogs = async (userId: string) => {
    try {
      const nextLogs = await timeApi.getUserLogs(userId);
      setLogs(nextLogs);
    } catch {
      void message.error('Не удалось загрузить записи времени');
    }
  };

  useEffect(() => {
    if (user) {
      void loadUserLogs(user.id);
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
      if (user) await loadUserLogs(user.id);
      void message.success('Таймер остановлен');
    } catch {
      void message.error('Ошибка');
    }
  };

  const handleManualSubmit = async (vals: { issueId: string; hours: number; note?: string; logDate?: { toISOString?: () => string } }) => {
    try {
      const logDate = vals.logDate
        ? (typeof vals.logDate === 'string'
            ? vals.logDate
            : (vals.logDate as { format?: (fmt: string) => string }).format?.('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10))
        : new Date().toISOString().slice(0, 10);
      await timeApi.logManual(vals.issueId, { hours: vals.hours, note: vals.note, logDate });
      void message.success('Запись добавлена');
      setManualOpen(false);
      manualForm.resetFields();
      if (user) await loadUserLogs(user.id);
    } catch {
      void message.error('Ошибка при сохранении');
    }
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

  // Stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const todayHours = useMemo(() =>
    logs
      .filter((l) => l.logDate.slice(0, 10) === todayStr)
      .reduce((sum, l) => sum + (l.hours ?? 0), 0),
    [logs, todayStr],
  );

  const weekHours = useMemo(() =>
    logs
      .filter((l) => getBusinessDate(l.logDate) >= weekFrom)
      .reduce((sum, l) => sum + (l.hours ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs],
  );

  const PERIOD_TABS: { label: string; value: 'today' | 'week' | 'month' | 'all' }[] = [
    { label: 'Сегодня', value: 'today' },
    { label: 'Неделя', value: 'week' },
    { label: 'Месяц', value: 'month' },
    { label: 'Всё время', value: 'all' },
  ];

  return (
    <div className="tt-page">
      {/* Header */}
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Учёт времени</h1>
          <p className="tt-page-subtitle">Ваши трудозатраты за период</p>
        </div>
        <div className="tt-page-actions">
          <Button
            className="tt-dashboard-new-btn"
            icon={<PlusOutlined />}
            onClick={() => setManualOpen(true)}
          >
            Ручной ввод
          </Button>
        </div>
      </div>

      {/* Active timer card */}
      {active && (
        <div className="tt-timer-card">
          <div className="tt-timer-card-accent" />
          <div className="tt-timer-card-left">
            <div className="tt-timer-pulse-wrap">
              <span className="tt-timer-pulse" />
            </div>
            <div className="tt-timer-card-info">
              <div className="tt-timer-elapsed">{elapsed}</div>
              {active.issue && (
                <div className="tt-timer-issue">
                  <Link to={`/issues/${active.issue.id}`} className="tt-timer-issue-key">
                    {active.issue.project?.key}-{active.issue.number}
                  </Link>
                  <span className="tt-timer-issue-title">{active.issue.title}</span>
                </div>
              )}
            </div>
          </div>
          <div className="tt-timer-card-actions">
            <Button
              icon={<PauseCircleOutlined />}
              className="tt-btn-ghost"
              onClick={() => void 0}
            >
              Пауза
            </Button>
            <Button
              icon={<StopOutlined />}
              danger
              onClick={() => void handleStop()}
            >
              Стоп
            </Button>
          </div>
        </div>
      )}

      {/* Period tabs + stats row */}
      <div className="tt-time-controls-row">
        <div className="tt-filter-pills">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`tt-filter-pill${period === tab.value ? ' tt-filter-pill-active' : ''}`}
              onClick={() => setPeriod(tab.value)}
            >
              {tab.label}
            </button>
          ))}
          {projectOptions.length > 0 && (
            <Select
              size="small"
              className="tt-filter-select"
              value={projectKey}
              style={{ minWidth: 120, marginLeft: 8 }}
              onChange={(v) => setProjectKey(v)}
              options={[
                { label: 'Все проекты', value: 'all' },
                ...projectOptions,
              ]}
            />
          )}
        </div>
        <div className="tt-time-stats-row">
          <div className="tt-time-stat">
            <span className="tt-time-stat-value">{fmtHours(todayHours)}</span>
            <span className="tt-time-stat-label">Сегодня</span>
          </div>
          <div className="tt-time-stat">
            <span className="tt-time-stat-value">{fmtHours(weekHours)}</span>
            <span className="tt-time-stat-label">Эта неделя</span>
          </div>
        </div>
      </div>

      {/* Time log table */}
      <div className="tt-time-table-wrap">
        <table className="tt-time-table">
          <thead>
            <tr>
              <th className="tt-time-th">ДАТА</th>
              <th className="tt-time-th">ЗАДАЧА</th>
              <th className="tt-time-th">КТО</th>
              <th className="tt-time-th tt-time-th-right">ВРЕМЯ</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="tt-time-empty">
                  Нет записей за выбранный период
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const userName = log.user?.name ?? 'Система';
                return (
                  <tr key={log.id} className="tt-time-tr">
                    <td className="tt-time-td tt-time-td-date">
                      {smartDate(log.logDate)}
                    </td>
                    <td className="tt-time-td">
                      {log.issue ? (
                        <Link to={`/issues/${log.issue.id}`} className="tt-time-issue-link">
                          <span className="tt-time-issue-key">
                            {log.issue.project?.key}-{log.issue.number}
                          </span>
                          <span className="tt-time-issue-title">{log.issue.title}</span>
                        </Link>
                      ) : (
                        <span className="tt-time-td-muted">—</span>
                      )}
                    </td>
                    <td className="tt-time-td">
                      <div className="tt-time-who">
                        <span
                          className="tt-time-avatar"
                          style={{ background: avatarColor(userName) }}
                        >
                          {getInitials(userName)}
                        </span>
                        <span className="tt-time-who-name">{userName}</span>
                      </div>
                    </td>
                    <td className="tt-time-td tt-time-td-right">
                      <span className="tt-time-duration">{fmtHours(log.hours)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Manual entry modal */}
      <Modal
        title="Ручной ввод времени"
        open={manualOpen}
        onCancel={() => { setManualOpen(false); manualForm.resetFields(); }}
        onOk={() => manualForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={manualForm} layout="vertical" onFinish={(v) => void handleManualSubmit(v)}>
          <Form.Item name="issueId" label="ID задачи" rules={[{ required: true, message: 'Укажите ID задачи' }]}>
            <Input placeholder="UUID задачи" />
          </Form.Item>
          <Form.Item name="hours" label="Часы" rules={[{ required: true, message: 'Укажите количество часов' }]}>
            <InputNumber min={0.1} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="logDate" label="Дата">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Комментарий">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
