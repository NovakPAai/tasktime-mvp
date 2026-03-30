import { useEffect } from 'react';
import { Card, Statistic, Table, Spin, Button, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useMonitoringStore } from '../../stores/monitoring.store.js';
import type { AggregatedMetrics } from '../../api/monitoring.js';

export default function AdminMonitoringTab() {
  const { systemMetrics, pageMetrics, endpointMetrics, systemLoading, endpointLoading, fetchSystemMetrics, fetchEndpointMetrics, clearMetrics } =
    useMonitoringStore();
  useEffect(() => {
    // Initial load
    void fetchSystemMetrics();
    void fetchEndpointMetrics();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      void fetchSystemMetrics();
      void fetchEndpointMetrics();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchSystemMetrics, fetchEndpointMetrics]);

  const handleRefresh = async () => {
    await Promise.all([fetchSystemMetrics(), fetchEndpointMetrics()]);
    void message.success('Metrics refreshed');
  };

  const handleClear = async () => {
    await clearMetrics();
    void message.success('Metrics cleared');
  };

  const slowEndpointsColumns = [
    {
      title: 'Endpoint',
      dataIndex: 'endpoint',
      key: 'endpoint',
      width: '35%',
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: '10%',
    },
    {
      title: 'Avg (ms)',
      dataIndex: 'avgDuration',
      key: 'avgDuration',
      width: '15%',
      align: 'right' as const,
      render: (value: number) => <span>{Math.round(value)}</span>,
    },
    {
      title: 'P95 (ms)',
      dataIndex: 'p95Duration',
      key: 'p95Duration',
      width: '15%',
      align: 'right' as const,
      render: (value: number) => <span style={{ color: '#d32f2f' }}>{Math.round(value)}</span>,
    },
    {
      title: 'Count',
      dataIndex: 'count',
      key: 'count',
      width: '10%',
      align: 'right' as const,
    },
  ];

  const errorDistributionColumns = [
    {
      title: 'Endpoint',
      dataIndex: 'endpoint',
      key: 'endpoint',
      width: '40%',
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: '15%',
    },
    {
      title: 'Error Count',
      dataIndex: 'errorCount',
      key: 'errorCount',
      width: '20%',
      align: 'right' as const,
      render: (_: unknown, record: AggregatedMetrics) => {
        const errorCount = Math.round((record.count * record.errorRate) / 100);
        return <span style={{ color: '#d32f2f' }}>{errorCount}</span>;
      },
    },
    {
      title: 'Error Rate',
      dataIndex: 'errorRate',
      key: 'errorRate',
      width: '15%',
      align: 'right' as const,
      render: (value: number) => <span style={{ color: value > 0 ? '#d32f2f' : '#999' }}>{value}%</span>,
    },
  ];

  const getLatestWebVitals = () => {
    if (pageMetrics.length === 0) return null;
    return pageMetrics[pageMetrics.length - 1];
  };

  const latestVitals = getLatestWebVitals();

  return (
    <Spin spinning={systemLoading || endpointLoading}>
      {/* Top Controls */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
          Обновить сейчас
        </Button>
        <Button danger onClick={handleClear}>
          Очистить метрики
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card>
          <Statistic
            title="Среднее время ответа"
            value={systemMetrics?.avgResponseTime ?? 0}
            suffix="мс"
            valueStyle={{ color: '#1f1f1f' }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>Среднее время всех запросов за последние 10 минут</div>
        </Card>
        <Card>
          <Statistic
            title="P95 время ответа"
            value={systemMetrics?.p95ResponseTime ?? 0}
            suffix="мс"
            valueStyle={{ color: '#1f1f1f' }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>95% запросов отвечают быстрее этого времени</div>
        </Card>
        <Card>
          <Statistic
            title="Процент ошибок"
            value={systemMetrics?.errorRate ?? 0}
            suffix="%"
            valueStyle={{ color: systemMetrics && systemMetrics.errorRate > 2 ? '#d32f2f' : '#1f1f1f' }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>Доля ошибочных ответов (4xx, 5xx)</div>
        </Card>
        <Card>
          <Statistic
            title="Количество запросов"
            value={systemMetrics?.recentRequests ?? 0}
            valueStyle={{ color: '#1f1f1f' }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>Всего запросов за последние 10 минут</div>
        </Card>
      </div>

      {/* Slow Endpoints Table */}
      <Card title="Медленные endpoint'ы (Top 5)" style={{ marginBottom: 24 }}>
        <Table
          columns={slowEndpointsColumns}
          dataSource={systemMetrics?.slowEndpoints ?? []}
          rowKey="endpoint"
          pagination={false}
          size="small"
        />
      </Card>

      {/* Web Vitals Cards */}
      {latestVitals && (
        <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card>
            <Statistic
              title="First Contentful Paint"
              value={latestVitals.fcp ?? 0}
              suffix="ms"
              valueStyle={{ color: latestVitals.fcp && latestVitals.fcp < 1800 ? '#2e7d32' : '#f57c00' }}
            />
          </Card>
          <Card>
            <Statistic
              title="Largest Contentful Paint"
              value={latestVitals.lcp ?? 0}
              suffix="ms"
              valueStyle={{ color: latestVitals.lcp && latestVitals.lcp < 2500 ? '#2e7d32' : '#f57c00' }}
            />
          </Card>
          <Card>
            <Statistic
              title="Cumulative Layout Shift"
              value={latestVitals.cls ?? 0}
              precision={3}
              valueStyle={{ color: latestVitals.cls && latestVitals.cls < 0.1 ? '#2e7d32' : '#f57c00' }}
            />
          </Card>
        </div>
      )}

      {/* Error Distribution Table */}
      <Card title="Распределение ошибок">
        <Table
          columns={errorDistributionColumns}
          dataSource={endpointMetrics.filter((m) => m.errorRate > 0)}
          rowKey="endpoint"
          pagination={false}
          size="small"
        />
      </Card>
    </Spin>
  );
}
