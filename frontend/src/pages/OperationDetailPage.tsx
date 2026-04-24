/**
 * TTBULK-1 PR-11 — /operations/:id детальная страница одной операции.
 *
 * Показывает summary (type/scope/progress/status/timestamps), ссылку на Report
 * CSV и кнопки Retry / Open in drawer / Cancel (если activec). Подключается
 * к `useBulkOperationStream(id)` для live-обновлений — в частности, чтобы
 * страницу не нужно было F5-ить для свежих counter'ов.
 *
 * См. docs/tz/TTBULK-1.md §3.4, §13.7 PR-11.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Descriptions,
  Space,
  Tag,
  Typography,
  message,
  Popconfirm,
  Spin,
  Result,
  Progress,
} from 'antd';
import { DownloadOutlined, ReloadOutlined, RedoOutlined, LeftOutlined } from '@ant-design/icons';
import { bulkOperationsApi } from '../api/bulkOperations';
import type { BulkOperation } from '../types/bulk.types';
import { OPERATION_LABELS, STATUS_COLORS } from '../types/bulk.types';
import { useBulkOperationsStore } from '../store/bulkOperations.store';
import { useBulkOperationStream } from '../components/bulk/useBulkOperationStream';
import { saveBlob } from '../utils/saveBlob';

const { Title, Text } = Typography;

export default function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addOperation = useBulkOperationsStore((s) => s.addOperation);
  const setDrawerOperationId = useBulkOperationsStore((s) => s.setDrawerOperationId);
  // Сохраняем snapshot в store перед stream'ом — hook начнёт updates и drawer
  // переиспользует данные без повторной выборки.
  const trackedSnapshot = useBulkOperationsStore((s) =>
    id ? s.operations[id]?.snapshot ?? null : null,
  );

  // Subscribe to live stream for this id (hook has its own null-guard).
  useBulkOperationStream(id ?? null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [op, setOp] = useState<BulkOperation | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Первоначальная выборка. Stream обновит counter'ы live; при полном refresh
  // страницы (F5) эта выборка тоже источник истины.
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = await bulkOperationsApi.get(id);
      setOp(fresh);
      // Push в store — чтобы drawer при открытии сразу имел данные.
      addOperation({ id: fresh.id, status: fresh.status, snapshot: fresh });
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      setLoadError(
        err?.response?.status === 404
          ? 'Операция не найдена'
          : err?.response?.data?.error ?? 'Не удалось загрузить операцию',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Show the freshest view: stream snapshot (если пришло) или initial fetch.
  const view = trackedSnapshot ?? op;

  const handleDownload = async () => {
    if (!id) return;
    try {
      const blob = await bulkOperationsApi.downloadReport(id);
      saveBlob(blob, `bulk-operation-${id}.csv`);
    } catch {
      void message.error('Не удалось скачать отчёт');
    }
  };

  const handleRetry = async () => {
    if (!view) return;
    setRetrying(true);
    try {
      const res = await bulkOperationsApi.retryFailed(view.id, crypto.randomUUID());
      addOperation({ id: res.id, status: res.status });
      setDrawerOperationId(res.id);
      void message.success('Retry создан');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error ?? 'Не удалось создать retry');
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (!view) return;
    setCancelling(true);
    try {
      await bulkOperationsApi.cancel(view.id);
      void message.info('Отмена запрошена');
      await load();
    } catch {
      void message.error('Не удалось отменить операцию');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (loadError || !view) {
    return (
      <Result
        status="warning"
        title={loadError ?? 'Операция не найдена'}
        extra={
          <Button type="primary" onClick={() => navigate('/operations')}>
            К списку операций
          </Button>
        }
      />
    );
  }

  const isActive = view.status === 'QUEUED' || view.status === 'RUNNING';
  const processed = view.succeeded + view.failed + view.skipped;
  const percent = view.total > 0 ? Math.round((processed / view.total) * 100) : 0;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<LeftOutlined />} onClick={() => navigate('/operations')}>
          К списку
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Операция #{view.id.slice(0, 8)}
        </Title>
        <Tag color={STATUS_COLORS[view.status]}>{view.status}</Tag>
      </div>

      <Progress
        percent={percent}
        status={
          isActive
            ? 'active'
            : view.status === 'FAILED' || view.status === 'PARTIAL'
              ? 'exception'
              : 'success'
        }
        format={() => `${processed} / ${view.total}`}
        style={{ marginBottom: 16 }}
      />

      <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Тип">
          {OPERATION_LABELS[view.type]?.label ?? view.type}
        </Descriptions.Item>
        <Descriptions.Item label="Scope">
          {view.scopeKind === 'jql' ? (
            <Text code>{view.scopeJql}</Text>
          ) : (
            <Text>IDs × {view.total}</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Создана">
          {new Date(view.createdAt).toLocaleString()}
        </Descriptions.Item>
        {view.startedAt && (
          <Descriptions.Item label="Запущена">
            {new Date(view.startedAt).toLocaleString()}
          </Descriptions.Item>
        )}
        {view.finishedAt && (
          <Descriptions.Item label="Завершена">
            {new Date(view.finishedAt).toLocaleString()}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Результат">
          <Space>
            <Tag color="green">Выполнено: {view.succeeded}</Tag>
            <Tag color="red">Ошибок: {view.failed}</Tag>
            <Tag color="orange">Пропущено: {view.skipped}</Tag>
          </Space>
        </Descriptions.Item>
        {view.finalStatusReason && (
          <Descriptions.Item label="Причина финального статуса">
            {view.finalStatusReason}
          </Descriptions.Item>
        )}
      </Descriptions>

      <Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          Обновить
        </Button>
        {!isActive && (
          <Button icon={<DownloadOutlined />} onClick={() => void handleDownload()}>
            Скачать отчёт CSV
          </Button>
        )}
        {view.failed > 0 && (
          <Popconfirm
            title="Повторить failed items?"
            description={`${view.failed} задач будут пересозданы в новой операции.`}
            onConfirm={() => void handleRetry()}
            okText="Retry"
            cancelText="Отмена"
          >
            <Button icon={<RedoOutlined />} loading={retrying}>
              Retry failed
            </Button>
          </Popconfirm>
        )}
        {isActive && (
          <Popconfirm
            title="Отменить операцию?"
            description="Уже обработанные задачи не откатываются."
            onConfirm={() => void handleCancel()}
            okText="Отменить"
            okButtonProps={{ danger: true }}
            cancelText="Оставить"
          >
            <Button danger loading={cancelling}>
              Отменить
            </Button>
          </Popconfirm>
        )}
      </Space>
    </div>
  );
}
