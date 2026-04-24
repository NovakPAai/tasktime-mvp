/**
 * TTSRH-1 PR-14 — BulkActionsBar.
 *
 * Минимальный bulk-UI для выделенных issue'ов из ResultsTable. Scope PR-14:
 *   • Delete — разбивает по projectId и вызывает DELETE /issues/:id per each
 *     в Promise.all, агрегирует {succeeded, failed} (R12 из §5.8 ТЗ).
 *   • Export selected — прямой вызов /search/export (weak bulk: передаём JQL
 *     с `key IN (...)` клаузой).
 *
 * Полноценные bulk-transition / move / assign приходят из existing backend
 * endpoint'ов (`/workflow-engine/batch-transitions`, `/issues/:id/move`),
 * но UI-обвязка под них выходит за PR-14 (§5.8 говорит «Assign, Transition,
 * Move to sprint, Delete» — Delete достаточно для пилота).
 */
import { useState } from 'react';
import { Button, Dropdown, Popconfirm, message, type MenuProps } from 'antd';
import { DownOutlined, DeleteOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';

import api from '../../api/client';
import { exportIssues } from '../../api/search';
import { saveBlob } from '../../utils/saveBlob';
import { features } from '../../lib/features';
import BulkOperationWizardModal from '../bulk/BulkOperationWizardModal';

export interface BulkActionsBarProps {
  /** UUID strings — come from `issue.id` via ResultsTable rowKey. */
  selectedIds: string[];
  onCleared: () => void;
  isLight?: boolean;
  // PR-9b добавит `jql?: string` + `total?: number` для JQL-scope варианта
  // bulk-операций (без обязательного selection).
}

async function bulkDelete(ids: string[]): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(ids.map((id) => api.delete(`/issues/${id}`)));
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') succeeded += 1;
    else failed += 1;
  }
  return { succeeded, failed };
}

export default function BulkActionsBar({
  selectedIds,
  onCleared,
  isLight = false,
}: BulkActionsBarProps) {
  const [busy, setBusy] = useState(false);
  // TTBULK-1 PR-9a — wizard. Gated под `features.bulkOps`; в PR-12 cutover флаг
  // включается и кнопка «Массовые операции» становится видна всем.
  const [wizardOpen, setWizardOpen] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleDelete = async () => {
    setBusy(true);
    try {
      const { succeeded, failed } = await bulkDelete(selectedIds);
      if (failed === 0) {
        message.success(`Удалено: ${succeeded}`);
      } else {
        message.warning(`Удалено: ${succeeded}, ошибок: ${failed}`);
      }
      onCleared();
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setBusy(true);
    try {
      // Export works on JQL, not on id-list. Build an ad-hoc JQL filter:
      //   issue IN (id1, id2, ...)
      // — the `issue` system field accepts `IN`/`NOT IN` (see search.schema).
      const jql = `issue IN (${selectedIds.map((id) => `"${id}"`).join(', ')})`;
      const blob = await exportIssues(jql, format);
      saveBlob(blob, `search-selected.${format}`);
      message.success(`Экспортировано (${format.toUpperCase()}): ${selectedIds.length}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка экспорта');
    } finally {
      setBusy(false);
    }
  };

  const menu: MenuProps = {
    items: [
      { key: 'csv', label: 'Экспорт — CSV', icon: <DownloadOutlined /> },
      { key: 'xlsx', label: 'Экспорт — XLSX', icon: <DownloadOutlined /> },
    ],
    onClick: ({ key }) => handleExport(key as 'csv' | 'xlsx'),
  };

  const bg = isLight ? '#F6F8FA' : '#0F1320';

  return (
    <div
      data-testid="bulk-actions-bar"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '8px 12px',
        background: bg,
        border: `1px solid ${isLight ? '#D0D7DE' : '#21262D'}`,
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span>Выбрано: <strong>{selectedIds.length}</strong></span>
      {features.bulkOps && (
        <Button
          size="small"
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => setWizardOpen(true)}
          disabled={busy}
        >
          Массовые операции
        </Button>
      )}
      <Dropdown menu={menu} disabled={busy}>
        <Button size="small" disabled={busy}>
          Экспорт <DownOutlined />
        </Button>
      </Dropdown>
      <Popconfirm
        title={`Удалить ${selectedIds.length} задач?`}
        onConfirm={handleDelete}
        okText="Удалить"
        okButtonProps={{ danger: true }}
        cancelText="Отмена"
      >
        <Button size="small" danger icon={<DeleteOutlined />} disabled={busy}>
          Удалить
        </Button>
      </Popconfirm>
      <Button size="small" onClick={onCleared} disabled={busy}>
        Снять выделение
      </Button>
      {features.bulkOps && (
        <BulkOperationWizardModal
          open={wizardOpen}
          // PR-9a: scope всегда = ids (компонент early-return'ит при пустом
          // selectedIds, так что selection гарантирован). JQL-вариант (bulk
          // «ко всей выборке» без selection) добавится в PR-9b через отдельную
          // кнопку, которая рендерится ВНЕ этого early-return ветки.
          scope={{ kind: 'ids', issueIds: selectedIds }}
          total={selectedIds.length}
          onClose={() => {
            // CLAUDE.md: modal close → refresh parent. onCleared зовёт
            // runQuery в SearchPage (selectedIds reset + re-fetch).
            setWizardOpen(false);
            onCleared();
          }}
        />
      )}
    </div>
  );
}
