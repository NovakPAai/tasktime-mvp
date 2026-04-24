/**
 * TTBULK-1 PR-11 — /operations страница: таблица моих массовых операций.
 *
 * Показывает операции пользователя (API listMine) с фильтрами по status/type
 * и пагинацией. Retry failed — создаёт новую операцию через retryFailed API;
 * результат push'ается в store + drawer открывается.
 *
 * Admin filter «Все операции» (видим только для ADMIN/SUPER_ADMIN) — deferred
 * в PR-12 polish (требует backend endpoint `/admin/bulk-operations` который не
 * входит в scope PR-11; TZ §7.4 отмечает это как admin-view).
 *
 * CLAUDE.md правило modal-refresh не применимо (нет модалок).
 *
 * См. docs/tz/TTBULK-1.md §3.4, §5.4, §13.7 PR-11.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Tooltip,
  Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, EyeOutlined, RedoOutlined } from '@ant-design/icons';
import { bulkOperationsApi, type ListQuery } from '../api/bulkOperations';
import type {
  BulkOperation,
  BulkOperationStatus,
  BulkOperationType,
} from '../types/bulk.types';
import { BULK_OPERATION_TYPES, OPERATION_LABELS, STATUS_COLORS } from '../types/bulk.types';
import { useBulkOperationsStore } from '../store/bulkOperations.store';

const { Title, Text } = Typography;

const STATUSES: readonly BulkOperationStatus[] = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
];

const PAGE_SIZE = 25;

export default function OperationsPage() {
  const navigate = useNavigate();
  const addOperation = useBulkOperationsStore((s) => s.addOperation);
  const setDrawerOperationId = useBulkOperationsStore((s) => s.setDrawerOperationId);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BulkOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [filterStatus, setFilterStatus] = useState<BulkOperationStatus | undefined>();
  const [filterType, setFilterType] = useState<BulkOperationType | undefined>();
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query: ListQuery = {
        limit: PAGE_SIZE,
        startAt,
        status: filterStatus,
        type: filterType,
      };
      const res = await bulkOperationsApi.listMine(query);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      void message.error('Не удалось загрузить операции');
    } finally {
      setLoading(false);
    }
  }, [startAt, filterStatus, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async (op: BulkOperation) => {
    setRetrying(op.id);
    try {
      const res = await bulkOperationsApi.retryFailed(op.id, crypto.randomUUID());
      addOperation({ id: res.id, status: res.status });
      setDrawerOperationId(res.id);
      void message.success('Операция-ретрай создана — открываем progress drawer');
      void load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error ?? 'Не удалось создать retry');
    } finally {
      setRetrying(null);
    }
  };

  const columns: ColumnsType<BulkOperation> = [
    {
      title: 'Создана',
      dataIndex: 'createdAt',
      width: 150,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Тип',
      dataIndex: 'type',
      width: 180,
      render: (t: BulkOperationType) => OPERATION_LABELS[t]?.label ?? t,
    },
    {
      title: 'Scope',
      dataIndex: 'scopeKind',
      width: 100,
      render: (kind: BulkOperation['scopeKind'], row) =>
        kind === 'ids' ? `IDs × ${row.total}` : <Tooltip title={row.scopeJql}>JQL</Tooltip>,
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 160,
      render: (_, row) => {
        const processed = row.succeeded + row.failed + row.skipped;
        const pct = row.total > 0 ? Math.round((processed / row.total) * 100) : 0;
        return (
          <Text style={{ fontSize: 12 }}>
            {processed}/{row.total} ({pct}%){' '}
            {row.failed > 0 && <Tag color="red" style={{ marginLeft: 4 }}>{row.failed} fail</Tag>}
          </Text>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: BulkOperationStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space size="small">
          <Tooltip title="Открыть">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/operations/${row.id}`)}
            />
          </Tooltip>
          {row.failed > 0 && (
            <Popconfirm
              title="Повторить failed items?"
              description={`${row.failed} задач будут пересозданы в новой операции.`}
              onConfirm={() => void handleRetry(row)}
              okText="Retry"
              cancelText="Отмена"
            >
              <Tooltip title="Retry failed">
                <Button
                  size="small"
                  icon={<RedoOutlined />}
                  loading={retrying === row.id}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Массовые операции
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Обновить
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Статус"
          allowClear
          style={{ width: 160 }}
          value={filterStatus}
          onChange={(v) => {
            setStartAt(0);
            setFilterStatus(v);
          }}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <Select
          placeholder="Тип"
          allowClear
          style={{ width: 220 }}
          value={filterType}
          onChange={(v) => {
            setStartAt(0);
            setFilterType(v);
          }}
          options={BULK_OPERATION_TYPES.map((t) => ({
            value: t,
            label: OPERATION_LABELS[t]?.label ?? t,
          }))}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={columns}
        size="small"
        pagination={{
          current: Math.floor(startAt / PAGE_SIZE) + 1,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (page) => setStartAt((page - 1) * PAGE_SIZE),
        }}
        locale={{ emptyText: 'Пока нет массовых операций' }}
      />
    </div>
  );
}
