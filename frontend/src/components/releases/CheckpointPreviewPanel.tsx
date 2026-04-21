/**
 * TTSRH-1 PR-18 — панель превью оценки checkpoint.
 *
 * Публичный API:
 *   • releaseOptions — список релизов для выбора (загружается родителем).
 *   • body — builder для CheckpointPreviewBody (mode + criteria + ttql + offset).
 *     Панель вызывает его на каждый запрос, чтобы получить актуальный payload
 *     из parent form'ы.
 *   • disabled — отключить запуск (например, при valid=false).
 *
 * UX:
 *   • Выбор релиза из select'а → кнопка «Рассчитать» → fetch /preview.
 *   • Результат: breakdown {applicable, passed, violated}, state badge,
 *     top-10 violations. meta.ttqlSkippedByFlag баннер.
 *   • Ошибки (400/403/404/500) → Alert-error.
 */
import { useState } from 'react';
import { Alert, Badge, Button, Card, List, Select, Tag, message } from 'antd';

import {
  previewCheckpointCondition,
  type CheckpointPreviewBody,
  type CheckpointPreviewResponse,
} from '../../api/release-checkpoint-types';

export interface CheckpointPreviewPanelProps {
  releaseOptions: Array<{ id: string; name: string; projectKey?: string }>;
  body: () => CheckpointPreviewBody | null;
  disabled?: boolean;
  isLight?: boolean;
}

function stateColor(state: CheckpointPreviewResponse['state']): string {
  switch (state) {
    case 'OK': return 'success';
    case 'VIOLATED': return 'error';
    case 'ERROR': return 'magenta';
    case 'PENDING':
    default: return 'default';
  }
}

export default function CheckpointPreviewPanel({
  releaseOptions,
  body,
  disabled = false,
  isLight = false,
}: CheckpointPreviewPanelProps) {
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckpointPreviewResponse | null>(null);

  const handleRun = async () => {
    if (!releaseId) {
      message.info('Выберите релиз');
      return;
    }
    const payload = body();
    if (!payload) {
      message.warning('Форма ещё не заполнена');
      return;
    }
    setLoading(true);
    try {
      const res = await previewCheckpointCondition({ ...payload, releaseId });
      setResult(res);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Ошибка preview';
      message.error(reason);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      size="small"
      data-testid="checkpoint-preview-panel"
      title="Превью оценки на релизе"
      style={{ marginTop: 12 }}
      styles={{ header: { fontSize: 13, fontWeight: 500 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Select
          placeholder="Выберите релиз"
          style={{ minWidth: 280 }}
          value={releaseId}
          onChange={setReleaseId}
          data-testid="preview-release-select"
          options={releaseOptions.map((r) => ({
            value: r.id,
            label: r.projectKey ? `${r.projectKey} — ${r.name}` : r.name,
          }))}
          showSearch
          optionFilterProp="label"
        />
        <Button
          type="primary"
          onClick={handleRun}
          loading={loading}
          disabled={disabled || !releaseId}
          data-testid="preview-run-button"
        >
          Рассчитать
        </Button>
      </div>

      {result?.meta.ttqlSkippedByFlag && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="TTQL не проверялся (FEATURES_CHECKPOINT_TTQL=false)"
          description="Результат — как STRUCTURED fallback. Для полной проверки включите флаг в окружении."
        />
      )}
      {result?.meta.ttqlError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="Ошибка TTQL"
          description={result.meta.ttqlError}
        />
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: isLight ? '#1F2328' : '#E2E8F8' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge status={stateColor(result.state) as 'success'} text={<strong>{result.state}</strong>} />
            <Tag color="blue">Applicable: {result.breakdown.applicable}</Tag>
            <Tag color="green">Passed: {result.breakdown.passed}</Tag>
            <Tag color="red">Violated: {result.breakdown.violated}</Tag>
            <Tag>Всего в релизе: {result.meta.totalIssuesInRelease}</Tag>
          </div>
          {result.violations.length > 0 && (
            <div>
              <strong style={{ fontSize: 12 }}>Нарушения (первые 10):</strong>
              <List
                size="small"
                style={{ marginTop: 6 }}
                dataSource={result.violations.slice(0, 10)}
                renderItem={(v) => (
                  <List.Item>
                    <Tag color="orange" style={{ fontFamily: 'monospace' }}>{v.issueKey || '—'}</Tag>
                    <span style={{ flex: 1, marginLeft: 8 }}>{v.issueTitle || v.reason}</span>
                    <Tag color="default">{v.criterionType}</Tag>
                  </List.Item>
                )}
              />
              {result.violations.length > 10 && (
                <span style={{ fontSize: 11, color: '#8B949E' }}>
                  …и ещё {result.violations.length - 10} нарушений.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
