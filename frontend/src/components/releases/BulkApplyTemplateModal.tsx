// TTMP-160 PR-8 / FR-21: bulk-apply a checkpoint template to many releases.
// Handles the 207 Multi-Status partitioning by rendering the result per-release.

import { Alert, Button, Modal, Result, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  type ApplyBulkResult,
  type CheckpointTemplate,
  applyBulkCheckpointTemplate,
  listCheckpointTemplates,
} from '../../api/release-checkpoint-templates';

type Props = {
  open: boolean;
  selectedReleases: Array<{ id: string; name: string }>;
  onClose: (applied: boolean) => void;
};

export default function BulkApplyTemplateModal({ open, selectedReleases, onClose }: Props) {
  const [templates, setTemplates] = useState<CheckpointTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyBulkResult | null>(null);

  const load = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(false);
    try {
      setTemplates(await listCheckpointTemplates());
    } catch {
      setTemplatesError(true);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTemplateId(null);
      setResult(null);
      setApplying(false);
      void load();
    }
  }, [open, load]);

  const runApply = async () => {
    if (!templateId) return;
    setApplying(true);
    try {
      const res = await applyBulkCheckpointTemplate(
        templateId,
        selectedReleases.map((r) => r.id),
      );
      setResult(res);
      if (res.successful.length > 0 && res.forbidden.length === 0 && res.failed.length === 0) {
        message.success(`Шаблон применён к ${res.successful.length} релизам`);
      } else {
        message.info(
          `Успешно: ${res.successful.length}, запрещено: ${res.forbidden.length}, ошибок: ${res.failed.length}`,
        );
      }
    } catch {
      message.error('Не удалось применить шаблон');
    } finally {
      setApplying(false);
    }
  };

  const footer = result
    ? [
        <Button
          key="close"
          type="primary"
          onClick={() => onClose(result.successful.length > 0)}
        >
          Закрыть
        </Button>,
      ]
    : [
        <Button key="cancel" onClick={() => onClose(false)}>
          Отмена
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!templateId || selectedReleases.length === 0}
          loading={applying}
          onClick={runApply}
        >
          Применить к {selectedReleases.length}
        </Button>,
      ];

  return (
    <Modal
      title={`Массовое применение шаблона (${selectedReleases.length} релизов)`}
      open={open}
      onCancel={() => onClose(result !== null && result.successful.length > 0)}
      footer={footer}
      destroyOnClose
      width={760}
    >
      {templatesError ? (
        <Result
          status="warning"
          title="Не удалось загрузить список шаблонов"
          subTitle="Попробуйте закрыть окно и открыть его снова."
        />
      ) : !result ? (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="info"
            showIcon
            message="FR-21: шаблон будет применён к каждому выбранному релизу."
            description="Права проверяются по каждому релизу отдельно (SEC-5). Релизы без прав попадут в раздел «Запрещено» и не будут обновлены."
          />
          <SelectedReleasesPreview releases={selectedReleases} />
          <Select
            showSearch
            placeholder={templatesLoading ? 'Загрузка шаблонов…' : 'Выберите шаблон'}
            style={{ width: '100%' }}
            value={templateId ?? undefined}
            onChange={(id) => setTemplateId(id)}
            loading={templatesLoading}
            disabled={templatesLoading || templates.length === 0}
            options={templates.map((t) => ({
              value: t.id,
              label: `${t.name} — ${t.items.length} типов`,
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
            }
          />
        </Space>
      ) : (
        <ResultView
          result={result}
          releaseNames={new Map(selectedReleases.map((r) => [r.id, r.name]))}
        />
      )}
    </Modal>
  );
}

function SelectedReleasesPreview({
  releases,
}: {
  releases: Array<{ id: string; name: string }>;
}) {
  if (releases.length === 0) return null;
  const display = releases.slice(0, 6);
  const rest = releases.length - display.length;
  return (
    <div style={{ color: '#555', fontSize: 12 }}>
      Выбранные релизы:{' '}
      {display.map((r) => (
        <Tag key={r.id}>{r.name}</Tag>
      ))}
      {rest > 0 && <Tag>+{rest}</Tag>}
    </div>
  );
}

function ResultView({
  result,
  releaseNames,
}: {
  result: ApplyBulkResult;
  releaseNames: Map<string, string>;
}) {
  const nameFor = (id: string): string => releaseNames.get(id) ?? id;

  const rows: Array<{
    key: string;
    releaseId: string;
    name: string;
    status: 'ok' | 'forbidden' | 'failed';
    reason?: string;
  }> = [
    ...result.successful.map((r) => ({
      key: `ok-${r.releaseId}`,
      releaseId: r.releaseId,
      name: r.releaseName,
      status: 'ok' as const,
    })),
    ...result.forbidden.map((r) => ({
      key: `fb-${r.releaseId}`,
      releaseId: r.releaseId,
      name: nameFor(r.releaseId),
      status: 'forbidden' as const,
      reason: r.reason,
    })),
    ...result.failed.map((r) => ({
      key: `fl-${r.releaseId}`,
      releaseId: r.releaseId,
      name: nameFor(r.releaseId),
      status: 'failed' as const,
      reason: r.reason,
    })),
  ];

  const columns: ColumnsType<(typeof rows)[number]> = [
    {
      title: 'Релиз',
      dataIndex: 'name',
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      width: 140,
      render: (status: (typeof rows)[number]['status']) => {
        if (status === 'ok') return <Tag color="green">Применено</Tag>;
        if (status === 'forbidden') return <Tag color="orange">Запрещено</Tag>;
        return <Tag color="red">Ошибка</Tag>;
      },
    },
    {
      title: 'Причина',
      dataIndex: 'reason',
      render: (r?: string) => r ?? '—',
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type={result.forbidden.length === 0 && result.failed.length === 0 ? 'success' : 'warning'}
        showIcon
        message={`Успешно: ${result.successful.length} · Запрещено: ${result.forbidden.length} · Ошибок: ${result.failed.length}`}
      />
      <Table rowKey="key" dataSource={rows} columns={columns} pagination={false} size="small" />
    </Space>
  );
}
