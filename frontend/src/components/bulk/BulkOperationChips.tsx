/**
 * TTBULK-1 PR-10 — floating chip'ы для активных массовых операций.
 *
 * Рендерится внизу справа (fixed), один chip на каждую активную операцию
 * (QUEUED/RUNNING). Клик по chip'у → `setDrawerOperationId(id)` (drawer open).
 * Есть «x» чтобы убрать chip из store (операция продолжит работать на backend).
 *
 * Показывается только при `features.bulkOps === true` (gated как wizard).
 *
 * Подключается к SSE streams через parent useEffect — см. AppLayout.tsx.
 * Chip тут не инициирует стрим сам (drawer делает; chip только читает store).
 *
 * См. docs/tz/TTBULK-1.md §3.3, §13.7 PR-10.
 */

import { Button, Space, Typography, Tag } from 'antd';
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { useBulkOperationsStore } from '../../store/bulkOperations.store';
import { STATUS_COLORS } from '../../types/bulk.types';
import { features } from '../../lib/features';

const { Text } = Typography;

export default function BulkOperationChips() {
  const activeOps = useBulkOperationsStore((s) => s.getActiveOperations());
  const setDrawerOperationId = useBulkOperationsStore((s) => s.setDrawerOperationId);
  const removeOperation = useBulkOperationsStore((s) => s.removeOperation);
  const drawerOperationId = useBulkOperationsStore((s) => s.drawerOperationId);

  if (!features.bulkOps || activeOps.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
      }}
    >
      {activeOps.map((op) => {
        const snapshot = op.snapshot;
        const total = snapshot?.total ?? 0;
        const processed = snapshot
          ? (snapshot.succeeded ?? 0) + (snapshot.failed ?? 0) + (snapshot.skipped ?? 0)
          : 0;
        const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
        const isOpen = drawerOperationId === op.id;

        return (
          <div
            key={op.id}
            onClick={() => setDrawerOperationId(op.id)}
            role="button"
            tabIndex={0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: '#fff',
              border: `1px solid ${isOpen ? '#1677ff' : 'rgba(0,0,0,0.12)'}`,
              borderRadius: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              cursor: 'pointer',
              minWidth: 240,
            }}
          >
            <LoadingOutlined />
            <Space size={4}>
              <Tag color={STATUS_COLORS[op.status]} style={{ margin: 0 }}>
                {op.status}
              </Tag>
              <Text style={{ fontSize: 12 }}>
                {processed} / {total} ({percent}%)
              </Text>
            </Space>
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                removeOperation(op.id);
              }}
              style={{ marginLeft: 'auto' }}
              aria-label="Скрыть chip"
            />
          </div>
        );
      })}
    </div>
  );
}
