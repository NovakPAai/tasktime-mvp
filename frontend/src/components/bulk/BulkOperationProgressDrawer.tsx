/**
 * TTBULK-1 PR-10 — ProgressDrawer для массовой операции.
 *
 * Открывается при submit'е из wizard'а или клике по chip'у. Показывает
 * status badge, progress bar, live-счётчики (processed/succeeded/failed/
 * skipped), ETA, кнопки Cancel / Collapse / Download CSV / Go to operation page.
 *
 * Использует `useBulkOperationStream(operationId)` для live-обновлений.
 *
 * Invariants:
 *   • onClose — закрытие drawer'а (зовёт `setDrawerOperationId(null)`).
 *     Сама операция остаётся в store (chip продолжает рендериться).
 *   • `removeOperation(id)` — только через явный «Закрыть/отменить» button,
 *     или после finalize когда юзер нажал «Скрыть».
 *   • Terminal-status drawer показывает summary + report CSV download,
 *     но не блокирует закрытие (→ chip тоже исчезнет).
 *
 * CLAUDE.md правило (modal/drawer close → refresh): в drawer'е live-данные
 * всегда свежие (SSE/poll), дополнительный refresh не требуется.
 *
 * См. docs/tz/TTBULK-1.md §3.3, §8.3, §13.7 PR-10.
 */

import { Drawer, Progress, Button, Space, Tag, Typography, Alert, Popconfirm, message } from 'antd';
import { CloseOutlined, DownloadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useBulkOperationsStore } from '../../store/bulkOperations.store';
import { useBulkOperationStream } from './useBulkOperationStream';
import { bulkOperationsApi } from '../../api/bulkOperations';
import { STATUS_COLORS, OPERATION_LABELS } from '../../types/bulk.types';
import { saveBlob } from '../../utils/saveBlob';

// Статичные цвета для Counter'ов. В проекте нет глобальных CSS-vars вида
// --green/--red; используем Ant hex'ы напрямую.
const COUNTER_COLORS: Record<string, string> = {
  green: '#52c41a',
  red: '#ff4d4f',
  orange: '#fa8c16',
  blue: '#1677ff',
};

const { Text } = Typography;

export default function BulkOperationProgressDrawer() {
  const drawerOperationId = useBulkOperationsStore((s) => s.drawerOperationId);
  const tracked = useBulkOperationsStore((s) =>
    drawerOperationId ? s.operations[drawerOperationId] : null,
  );
  const setDrawerOperationId = useBulkOperationsStore((s) => s.setDrawerOperationId);
  const removeOperation = useBulkOperationsStore((s) => s.removeOperation);

  // SSE/polling подключение к операции, открытой в drawer'е.
  useBulkOperationStream(drawerOperationId);

  const handleClose = () => setDrawerOperationId(null);

  const handleCancel = async () => {
    if (!drawerOperationId) return;
    try {
      await bulkOperationsApi.cancel(drawerOperationId);
      void message.info('Отмена запрошена; processor завершит активный batch');
    } catch {
      void message.error('Не удалось отменить операцию');
    }
  };

  const handleDownload = async () => {
    if (!drawerOperationId) return;
    try {
      const blob = await bulkOperationsApi.downloadReport(drawerOperationId);
      saveBlob(blob, `bulk-operation-${drawerOperationId}.csv`);
    } catch {
      void message.error('Не удалось скачать отчёт');
    }
  };

  const handleRemove = () => {
    if (!drawerOperationId) return;
    removeOperation(drawerOperationId);
  };

  const open = drawerOperationId !== null;
  const snapshot = tracked?.snapshot ?? null;
  const status = tracked?.status ?? 'QUEUED';
  const total = snapshot?.total ?? 0;
  const processed = (snapshot?.succeeded ?? 0) + (snapshot?.failed ?? 0) + (snapshot?.skipped ?? 0);
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isActive = status === 'QUEUED' || status === 'RUNNING';
  const isTerminal = !isActive;

  return (
    <Drawer
      title={
        <Space>
          <Tag color={STATUS_COLORS[status]}>{status}</Tag>
          <span>
            {snapshot ? OPERATION_LABELS[snapshot.type]?.label ?? snapshot.type : 'Массовая операция'}
          </span>
        </Space>
      }
      placement="right"
      width={420}
      open={open}
      onClose={handleClose}
      closeIcon={<CloseOutlined />}
      extra={
        isActive ? (
          <Popconfirm
            title="Отменить операцию?"
            description="Уже обработанные задачи не откатываются; processor завершит активный batch."
            onConfirm={() => void handleCancel()}
            okText="Отменить"
            okButtonProps={{ danger: true }}
            cancelText="Оставить"
          >
            <Button size="small" danger icon={<CloseCircleOutlined />}>
              Отменить
            </Button>
          </Popconfirm>
        ) : (
          <Button size="small" onClick={handleRemove}>
            Скрыть
          </Button>
        )
      }
    >
      {!snapshot && <Text type="secondary">Подключаемся к операции…</Text>}

      {snapshot && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Progress
            percent={percent}
            status={
              isActive
                ? 'active'
                : status === 'FAILED' || status === 'PARTIAL'
                  ? 'exception'
                  : 'success'
            }
            format={() => `${processed} / ${total}`}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Counter label="Выполнено" value={snapshot.succeeded ?? 0} color="green" />
            <Counter label="Ошибок" value={snapshot.failed ?? 0} color="red" />
            <Counter label="Пропущено" value={snapshot.skipped ?? 0} color="orange" />
            <Counter label="Обработано" value={processed} color="blue" />
          </div>

          {snapshot.cancelRequested && isActive && (
            <Alert
              type="warning"
              showIcon
              message="Отмена запрошена"
              description="Processor завершит текущий batch и остановит операцию."
            />
          )}

          {isTerminal && (
            <Space wrap>
              <Button icon={<DownloadOutlined />} onClick={() => void handleDownload()}>
                Скачать отчёт CSV
              </Button>
            </Space>
          )}

          {snapshot.finalStatusReason && (
            <Alert
              type={status === 'FAILED' ? 'error' : 'info'}
              showIcon
              message="Финальный статус"
              description={snapshot.finalStatusReason}
            />
          )}
        </Space>
      )}
    </Drawer>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'rgba(0,0,0,0.03)',
        borderRadius: 6,
        borderLeft: `3px solid ${COUNTER_COLORS[color] ?? color}`,
      }}
    >
      <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
