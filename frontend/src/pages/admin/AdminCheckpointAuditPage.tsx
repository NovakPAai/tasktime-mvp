// TTMP-160 PR-8 / FR-23: audit page for checkpoint violations.
// Accessible to AUDITOR / ADMIN / SUPER_ADMIN (gated at both the backend and via
// <AdminGate> on the route).

import { DownloadOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Input,
  Result,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type AuditEventRow,
  type AuditFilters,
  downloadAuditCsv,
  listAuditEvents,
} from '../../api/checkpoint-audit';

const { RangePicker } = DatePicker;

export default function AdminCheckpointAuditPage() {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [projectIdFilter, setProjectIdFilter] = useState('');
  const [releaseIdFilter, setReleaseIdFilter] = useState('');
  const [checkpointTypeIdFilter, setCheckpointTypeIdFilter] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  const buildFilters = useCallback((): AuditFilters => {
    const filters: AuditFilters = {};
    if (dateRange?.[0]) filters.from = dateRange[0].format('YYYY-MM-DD');
    if (dateRange?.[1]) filters.to = dateRange[1].format('YYYY-MM-DD');
    if (projectIdFilter) filters.projectId = projectIdFilter;
    if (releaseIdFilter) filters.releaseId = releaseIdFilter;
    if (checkpointTypeIdFilter) filters.checkpointTypeId = checkpointTypeIdFilter;
    if (onlyOpen) filters.onlyOpen = true;
    return filters;
  }, [dateRange, projectIdFilter, releaseIdFilter, checkpointTypeIdFilter, onlyOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setEvents(await listAuditEvents(buildFilters()));
    } catch {
      setLoadError(true);
      message.error('Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const blob = await downloadAuditCsv(buildFilters());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkpoint-audit-${dayjs().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Safari/Firefox abort the download if we revoke before the browser has read the
      // blob; defer to the next tick (same pattern as SecurityTab export).
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      message.error('Не удалось скачать CSV');
    } finally {
      setDownloading(false);
    }
  };

  const columns: ColumnsType<AuditEventRow> = [
    {
      title: 'Время',
      dataIndex: 'occurredAt',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      sorter: (a, b) => a.occurredAt.localeCompare(b.occurredAt),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Проект',
      dataIndex: 'projectKey',
      width: 90,
      render: (key: string | null, row) =>
        key ? (
          <Tooltip title={row.projectName ?? ''}>
            <Tag>{key}</Tag>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      title: 'Релиз',
      dataIndex: 'releaseName',
      width: 160,
    },
    {
      title: 'Контрольная точка',
      dataIndex: 'checkpointName',
      width: 180,
    },
    {
      title: 'Задача',
      dataIndex: 'issueKey',
      width: 140,
      render: (key: string, row) => (
        <Link to={`/issues/${row.issueId}`}>
          <strong>{key}</strong>
        </Link>
      ),
    },
    {
      title: 'Критерий',
      dataIndex: 'criterionType',
      width: 170,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: 'Причина',
      dataIndex: 'reason',
      ellipsis: { showTitle: true },
    },
    {
      title: 'Исправлено',
      dataIndex: 'resolvedAt',
      width: 150,
      render: (v: string | null) =>
        v ? (
          <Tag color="green">{dayjs(v).format('YYYY-MM-DD HH:mm')}</Tag>
        ) : (
          <Tag color="red">открыта</Tag>
        ),
    },
  ];

  return (
    <div className="tt-page">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <h2 className="tt-page-title">Журнал контрольных точек</h2>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownloadCsv}
          loading={downloading}
          disabled={events.length === 0}
        >
          Экспорт CSV
        </Button>
      </div>

      <Space wrap size={8} style={{ marginBottom: 16 }}>
        <FilterOutlined style={{ color: '#999' }} />
        <RangePicker value={dateRange ?? undefined} onChange={(v) => setDateRange(v)} />
        <Input
          placeholder="UUID проекта (опционально)"
          allowClear
          value={projectIdFilter}
          onChange={(e) => setProjectIdFilter(e.target.value)}
          style={{ width: 240 }}
        />
        <Input
          placeholder="UUID релиза (опционально)"
          allowClear
          value={releaseIdFilter}
          onChange={(e) => setReleaseIdFilter(e.target.value)}
          style={{ width: 240 }}
        />
        <Input
          placeholder="UUID типа точки (опционально)"
          allowClear
          value={checkpointTypeIdFilter}
          onChange={(e) => setCheckpointTypeIdFilter(e.target.value)}
          style={{ width: 260 }}
        />
        <Space>
          <Switch checked={onlyOpen} onChange={setOnlyOpen} />
          <span style={{ fontSize: 13 }}>Только неисправленные</span>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Обновить
        </Button>
      </Space>

      {loadError ? (
        <Result
          status="warning"
          title="Не удалось загрузить журнал"
          subTitle="Проверьте фильтры и попробуйте снова."
          extra={
            <Button type="primary" onClick={() => void load()} loading={loading}>
              Повторить
            </Button>
          }
        />
      ) : (
        <Table
          rowKey="id"
          dataSource={events}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 50, showTotal: (t) => `Всего событий: ${t}` }}
          size="small"
        />
      )}
    </div>
  );
}
