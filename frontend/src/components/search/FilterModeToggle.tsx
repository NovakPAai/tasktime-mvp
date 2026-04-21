/**
 * TTSRH-1 PR-12 — сегмент-кнопка Basic | Advanced для SearchPage.
 *
 * Инварианты:
 *   • `disabled` + `disabledReason` — Basic-режим блокируется когда JQL
 *     содержит OR / NOT / группировку / history-operators (R9). Tooltip
 *     показывает причину через `title`-attribute.
 *   • `aria-pressed` на каждом сегменте, `role="group"` на контейнере.
 */
import { useMemo } from 'react';

export type FilterMode = 'basic' | 'advanced';

export interface FilterModeToggleProps {
  mode: FilterMode;
  onChange: (mode: FilterMode) => void;
  basicDisabled?: boolean;
  basicDisabledReason?: string;
  isLight?: boolean;
}

export default function FilterModeToggle({
  mode,
  onChange,
  basicDisabled = false,
  basicDisabledReason,
  isLight = false,
}: FilterModeToggleProps) {
  const c = useMemo(
    () =>
      isLight
        ? { bg: '#F6F8FA', active: '#FFFFFF', border: '#D0D7DE', text: '#1F2328', activeText: '#4F6EF7', muted: '#8B949E' }
        : { bg: '#0F1320', active: '#1F2937', border: '#21262D', text: '#E2E8F8', activeText: '#7c93ff', muted: '#8B949E' },
    [isLight],
  );

  function btnStyle(active: boolean, disabled: boolean): React.CSSProperties {
    return {
      padding: '4px 14px',
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      color: disabled ? c.muted : active ? c.activeText : c.text,
      background: active && !disabled ? c.active : 'transparent',
      border: 'none',
      borderRadius: 5,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit',
      transition: 'background 0.12s',
    };
  }

  return (
    <div
      role="group"
      aria-label="Filter mode"
      data-testid="filter-mode-toggle"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        border: `1px solid ${c.border}`,
        borderRadius: 7,
        background: c.bg,
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        data-testid="mode-basic"
        aria-pressed={mode === 'basic'}
        disabled={basicDisabled}
        title={basicDisabled ? basicDisabledReason : undefined}
        onClick={() => !basicDisabled && onChange('basic')}
        style={btnStyle(mode === 'basic', basicDisabled)}
      >
        Basic
      </button>
      <button
        type="button"
        data-testid="mode-advanced"
        aria-pressed={mode === 'advanced'}
        onClick={() => onChange('advanced')}
        style={btnStyle(mode === 'advanced', false)}
      >
        Advanced
      </button>
    </div>
  );
}
