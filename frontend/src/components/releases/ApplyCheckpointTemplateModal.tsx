// TTMP-160 PR-6 / FR-14: 2-step "Apply template to release" modal.
// Step 1 — pick a template. Step 2 — show the backend's preview (per-type projected state
// and violations) so the user sees what will happen before they commit.

import { Alert, Button, Modal, Result, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  applyTemplate,
  type CheckpointPreviewItem,
  previewTemplate,
} from '../../api/release-checkpoints';
import {
  type CheckpointTemplate,
  listCheckpointTemplates,
} from '../../api/release-checkpoint-templates';
import CheckpointTrafficLight from './CheckpointTrafficLight';

type Props = {
  open: boolean;
  releaseId: string;
  onClose: (applied: boolean) => void;
};

export default function ApplyCheckpointTemplateModal({ open, releaseId, onClose }: Props) {
  const [templates, setTemplates] = useState<CheckpointTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<CheckpointPreviewItem[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadTemplates = useCallback(async () => {
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
      setPreviews(null);
      setApplying(false); // reset in case a prior close happened mid-apply
      void loadTemplates();
    }
  }, [open, loadTemplates]);

  const runPreview = async () => {
    if (!templateId) return;
    setPreviewLoading(true);
    try {
      const res = await previewTemplate(releaseId, templateId);
      setPreviews(res.previews);
    } catch (err) {
      const reason = detectError(err);
      if (reason === 'RELEASE_PLANNED_DATE_REQUIRED') {
        message.error('У релиза не задана плановая дата (plannedDate)');
      } else {
        message.error('Не удалось получить предпросмотр');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const runApply = async () => {
    if (!templateId) return;
    setApplying(true);
    try {
      await applyTemplate(releaseId, templateId);
      message.success('Шаблон применён');
      onClose(true);
    } catch (err) {
      const reason = detectError(err);
      if (reason === 'RELEASE_PLANNED_DATE_REQUIRED') {
        message.error('У релиза не задана плановая дата (plannedDate)');
      } else {
        message.error('Не удалось применить шаблон');
      }
    } finally {
      setApplying(false);
    }
  };

  const footer = previews
    ? [
        <Button key="back" onClick={() => setPreviews(null)}>
          Назад
        </Button>,
        <Button key="cancel" onClick={() => onClose(false)}>
          Отмена
        </Button>,
        <Button key="apply" type="primary" loading={applying} onClick={runApply}>
          Применить
        </Button>,
      ]
    : [
        <Button key="cancel" onClick={() => onClose(false)}>
          Отмена
        </Button>,
        <Button
          key="preview"
          type="primary"
          loading={previewLoading}
          disabled={!templateId}
          onClick={runPreview}
        >
          Предпросмотр
        </Button>,
      ];

  return (
    <Modal
      title="Применить шаблон контрольных точек"
      open={open}
      onCancel={() => onClose(false)}
      footer={footer}
      destroyOnClose
      width={760}
    >
      {templatesError ? (
        <Result
          status="warning"
          title="Не удалось загрузить список шаблонов"
          subTitle="Закройте окно и попробуйте снова."
        />
      ) : !previews ? (
        <TemplatePicker
          templates={templates}
          loading={templatesLoading}
          value={templateId}
          onChange={setTemplateId}
        />
      ) : (
        <PreviewTable previews={previews} />
      )}
    </Modal>
  );
}

function TemplatePicker({
  templates,
  loading,
  value,
  onChange,
}: {
  templates: CheckpointTemplate[];
  loading: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        message="FR-14: при нажатии «Предпросмотр» мы покажем ожидаемое состояние без изменения БД. «Применить» выполнит снапшот критериев и запустит пересчёт."
      />
      <Select
        showSearch
        placeholder={loading ? 'Загрузка шаблонов…' : 'Выберите шаблон'}
        style={{ width: '100%' }}
        value={value ?? undefined}
        onChange={(id: string) => onChange(id)}
        loading={loading}
        disabled={loading || templates.length === 0}
        options={templates.map((t) => ({
          value: t.id,
          label: `${t.name} — ${t.items.length} типов`,
        }))}
        filterOption={(input, option) =>
          (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
        }
      />
      {templates.length === 0 && !loading && (
        <Alert
          type="warning"
          message="Нет доступных шаблонов"
          description="Создайте шаблон в админке «Шаблоны контрольных точек»."
        />
      )}
    </Space>
  );
}

function PreviewTable({ previews }: { previews: CheckpointPreviewItem[] }) {
  const columns: ColumnsType<CheckpointPreviewItem> = [
    {
      title: 'Тип',
      render: (_, row) => (
        <Space>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: row.color,
              display: 'inline-block',
            }}
          />
          <strong>{row.name}</strong>
          <Tag>{row.weight}</Tag>
        </Space>
      ),
    },
    {
      title: 'Дедлайн',
      dataIndex: 'deadline',
      width: 120,
    },
    {
      title: 'Будет',
      dataIndex: 'wouldBeState',
      width: 140,
      render: (state) => <CheckpointTrafficLight state={state} isWarning={false} />,
    },
    {
      title: 'Применимо / Прошли / Нарушают',
      width: 260,
      render: (_, row) => (
        <Space size={6}>
          <Tag>{row.breakdown.applicable}</Tag>
          <Tag color="green">{row.breakdown.passed}</Tag>
          <Tag color="red">{row.breakdown.violated}</Tag>
        </Space>
      ),
    },
  ];

  const violatedCount = previews.filter((p) => p.wouldBeState === 'VIOLATED').length;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type={violatedCount > 0 ? 'warning' : 'info'}
        showIcon
        message={
          violatedCount > 0
            ? `${violatedCount} из ${previews.length} контрольных точек были бы сразу нарушены`
            : 'Нарушений при применении шаблона не ожидается'
        }
      />
      <Table
        rowKey="checkpointTypeId"
        dataSource={previews}
        columns={columns}
        pagination={false}
        size="small"
      />
    </Space>
  );
}

function detectError(err: unknown): string | null {
  const anyErr = err as { response?: { data?: { error?: string } } };
  return anyErr?.response?.data?.error ?? null;
}
