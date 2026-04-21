/**
 * TTSRH-1 PR-18 — управляющий UI для conditionMode в checkpoint form.
 *
 * Публичный API:
 *   • value — текущий режим (STRUCTURED / TTQL / COMBINED).
 *   • onChange(next) — переключить.
 *   • ttqlValue / onTtqlChange — биндинг TTQL-поля; показывается когда
 *     режим TTQL или COMBINED.
 *   • disabled — toggle disabled (например, при save).
 *   • isLight — theme.
 *
 * Инварианты:
 *   • Переключение режима НЕ стирает criteria[] / ttqlCondition (R20) —
 *     родительская форма хранит оба поля независимо, здесь мы только
 *     toggle'им визибельность.
 *   • При pre-save валидация проверяет соответствие mode ↔ payload
 *     (see backend DTO superRefine).
 *   • JqlEditor загружается лениво и только если пользователь открыл
 *     TTQL/COMBINED mode (уже lazy в PR-10, здесь дополнительно
 *     conditionally-render).
 */
import { useMemo } from 'react';
import { Segmented } from 'antd';

import type { CheckpointConditionMode } from '../../api/release-checkpoint-types';
import JqlEditor from '../search/JqlEditor.lazy';

export interface CheckpointConditionModeControlProps {
  value: CheckpointConditionMode;
  onChange: (next: CheckpointConditionMode) => void;
  ttqlValue: string;
  onTtqlChange: (value: string) => void;
  disabled?: boolean;
  isLight?: boolean;
}

const MODE_LABELS: Record<CheckpointConditionMode, string> = {
  STRUCTURED: 'Structured',
  TTQL: 'TTQL',
  COMBINED: 'Combined',
};

const MODE_HINTS: Record<CheckpointConditionMode, string> = {
  STRUCTURED: 'Стандартные правила (critериi) — быстро и проверено.',
  TTQL: 'Выражение на TTS-QL. Мощнее, но требует знания синтаксиса. Доступна функция checkpointDeadline().',
  COMBINED: 'И structured критерии, И TTQL — issue должен пройти оба.',
};

export default function CheckpointConditionModeControl({
  value,
  onChange,
  ttqlValue,
  onTtqlChange,
  disabled = false,
  isLight = false,
}: CheckpointConditionModeControlProps) {
  const options = useMemo(
    () =>
      (['STRUCTURED', 'TTQL', 'COMBINED'] as const).map((mode) => ({
        label: MODE_LABELS[mode],
        value: mode,
      })),
    [],
  );

  const hint = MODE_HINTS[value];
  const showStructured = value === 'STRUCTURED' || value === 'COMBINED';
  const showTtql = value === 'TTQL' || value === 'COMBINED';

  return (
    <div data-testid="checkpoint-condition-mode-control" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Segmented
          options={options}
          value={value}
          disabled={disabled}
          onChange={(v) => onChange(v as CheckpointConditionMode)}
          data-testid="condition-mode-segmented"
        />
        <span style={{ fontSize: 12, color: isLight ? '#6B7280' : '#8B949E' }}>{hint}</span>
      </div>
      {showTtql && (
        <div data-testid="condition-mode-ttql-section" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: isLight ? '#1F2328' : '#E2E8F8' }}>
            TTS-QL условие (variant=checkpoint)
          </label>
          <JqlEditor
            value={ttqlValue}
            onChange={onTtqlChange}
            onSubmit={() => { /* no-op — submit driven by outer form */ }}
            isLight={isLight}
            placeholder='status = DONE AND assignee IS NOT EMPTY'
          />
          <span style={{ fontSize: 11, color: isLight ? '#6B7280' : '#8B949E' }}>
            Доступен полный реестр TTS-QL + КТ-функции. `currentUser()` в КТ резолвится в NULL (выдаётся warning).
          </span>
        </div>
      )}
      {!showStructured && value === 'TTQL' && (
        <div style={{ fontSize: 11, color: isLight ? '#8B949E' : '#6B7280', fontStyle: 'italic' }}>
          Structured критерии игнорируются в TTQL режиме (но остаются сохранёнными — переключение назад не теряет их).
        </div>
      )}
    </div>
  );
}

/**
 * TTSRH-1 PR-18 — иконка режима КТ для таблицы types.
 * S = structured (зелёный), Q = ttql (синий), S+Q = combined (фиолетовый).
 */
export function CheckpointConditionModeIcon({
  mode,
  isLight = false,
}: {
  mode: CheckpointConditionMode;
  isLight?: boolean;
}) {
  const colors = {
    STRUCTURED: isLight ? '#16A34A' : '#4ADE80',
    TTQL: isLight ? '#2563EB' : '#60A5FA',
    COMBINED: isLight ? '#9333EA' : '#C084FC',
  };
  const label = { STRUCTURED: 'S', TTQL: 'Q', COMBINED: 'S+Q' };
  const title = { STRUCTURED: 'Structured criteria', TTQL: 'TTS-QL condition', COMBINED: 'Structured + TTS-QL' };
  return (
    <span
      title={title[mode]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        padding: '0 6px',
        height: 20,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        backgroundColor: colors[mode],
        fontFamily: '"JetBrains Mono", monospace',
      }}
      data-testid={`mode-icon-${mode}`}
    >
      {label[mode]}
    </span>
  );
}
