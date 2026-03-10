import { useEffect, useState } from 'react';
import { Typography, Table, Card, Space, Button, message } from 'antd';
import { ClockCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as timeApi from '../api/time';
import { useAuthStore } from '../store/auth.store';
import type { TimeLog } from '../types';

export default function TimePage() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [active, setActive] = useState<TimeLog | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (user) {
      timeApi.getUserLogs(user.id).then(setLogs);
      timeApi.getActiveTimer().then(setActive);
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
      if (user) timeApi.getUserLogs(user.id).then(setLogs);
      message.success('Timer stopped');
    } catch { message.error('Error'); }
  };

  const totalHours = logs.reduce((sum, l) => sum + Number(l.hours), 0);

  const columns = [
    { title: 'Issue', key: 'issue', render: (_: unknown, r: TimeLog) => r.issue ? (
      <Link to={`/issues/${r.issue.id}`}>{r.issue.project?.key}-{r.issue.number} {r.issue.title}</Link>
    ) : '-' },
    { title: 'Hours', dataIndex: 'hours', width: 80, render: (h: number) => Number(h).toFixed(2) },
    { title: 'Note', dataIndex: 'note', width: 200, render: (n: string) => n || '-' },
    { title: 'Date', dataIndex: 'createdAt', width: 120, render: (d: string) => new Date(d).toLocaleDateString() },
  ];

  return (
    <div>
      <Typography.Title level={4}>My Time</Typography.Title>

      {active && (
        <Card size="small" style={{ marginBottom: 16, borderColor: '#1677ff' }}>
          <Space>
            <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 20 }} />
            <Typography.Text strong style={{ fontSize: 24, fontFamily: 'monospace' }}>{elapsed}</Typography.Text>
            {active.issue && <Link to={`/issues/${active.issue.id}`}>{active.issue.project?.key}-{active.issue.number} {active.issue.title}</Link>}
            <Button icon={<PauseCircleOutlined />} danger onClick={handleStop}>Stop</Button>
          </Space>
        </Card>
      )}

      <Typography.Text type="secondary">Total logged: {totalHours.toFixed(2)} hours</Typography.Text>
      <Table dataSource={logs} columns={columns} rowKey="id" size="small" pagination={{ pageSize: 20 }} style={{ marginTop: 8 }} />
    </div>
  );
}
