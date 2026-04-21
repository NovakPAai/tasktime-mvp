/**
 * TTSRH-1 PR-12 — BasicFilterBuilder: chip-based UI над JQL.
 *
 * Публичный API:
 *   • value — JQL-строка. При mount chip'ы парсятся через `chipsFromJql`.
 *   • onChange(newJql) — вызывается при каждом добавлении / удалении / редактировании.
 *
 * Инварианты:
 *   • Каждый chip — простая `field op value(s)` запись, neighbours неявно
 *     соединяются `AND`.
 *   • Cascade-меню «Добавить фильтр» построено из `CATEGORIES` (§5.7).
 *   • Клик по chip'у раскрывает inline-form для редактирования (popover
 *     поверх Ant-Design будет в PR-13; здесь — native details/summary для
 *     минимизации deps). Value-ввод — обычный `<input>`. `ValueSuggesterPopup`-
 *     интеграция живёт отдельно в next-PR (PR-13 Sidebar + Modals).
 *   • onChange debounced через request-animation-frame чтобы избежать
 *     re-render-cascade в родителе — но сохраняем строгое atomic-update (каждый
 *     commit chips → jqlFromChips → onChange).
 *   • aria-labels на всех интерактивных узлах (A11Y-1).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  BasicChip,
  BasicOp,
  CATEGORIES,
  chipsFromJql,
  jqlFromChips,
} from './basic-filter-model';

export interface BasicFilterBuilderProps {
  value: string;
  onChange: (jql: string) => void;
  isLight?: boolean;
}

const OPS: BasicOp[] = ['=', '!=', 'IN', 'NOT IN'];

export default function BasicFilterBuilder({ value, onChange, isLight = false }: BasicFilterBuilderProps) {
  const [chips, setChips] = useState<BasicChip[]>(() => chipsFromJql(value).chips);
  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sync chips from external value changes (e.g. saved-filter load).
  useEffect(() => {
    const parsed = chipsFromJql(value);
    if (!parsed.ok) return;
    // Compare by serialized form to avoid re-setting if semantically equal.
    if (jqlFromChips(parsed.chips) !== jqlFromChips(chips)) {
      setChips(parsed.chips);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = useCallback(
    (next: BasicChip[]) => {
      setChips(next);
      onChange(jqlFromChips(next));
    },
    [onChange],
  );

  const c = useMemo(
    () =>
      isLight
        ? { border: '#D0D7DE', chipBg: '#EFF4FF', chipBorder: '#CCD6F5', text: '#1F2328', muted: '#656D76', acc: '#4F6EF7', panel: '#FFFFFF' }
        : { border: '#21262D', chipBg: '#1A2040', chipBorder: '#2A3260', text: '#E2E8F8', muted: '#8B949E', acc: '#7c93ff', panel: '#1A1F2E' },
    [isLight],
  );

  const addChip = (field: string) => {
    const id = `c${Date.now()}`;
    const next = [...chips, { id, field, op: '=' as BasicOp, values: [''] }];
    commit(next);
    setAddingOpen(false);
    setEditingId(id);
  };

  const updateChip = (id: string, patch: Partial<BasicChip>) => {
    commit(chips.map((c0) => (c0.id === id ? { ...c0, ...patch } : c0)));
  };

  const removeChip = (id: string) => {
    commit(chips.filter((c0) => c0.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <div data-testid="basic-filter-builder" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {chips.map((chip) => {
        const isEditing = editingId === chip.id;
        const displayValue = chip.values.length > 1 ? chip.values.join(', ') : chip.values[0] ?? '';
        return (
          <div
            key={chip.id}
            data-testid={`basic-chip-${chip.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              border: `1px solid ${c.chipBorder}`,
              background: c.chipBg,
              color: c.text,
              borderRadius: 14,
              fontSize: 12,
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            {isEditing ? (
              <>
                <span style={{ fontWeight: 500 }}>{chip.field}</span>
                <select
                  aria-label="Operator"
                  value={chip.op}
                  onChange={(e) => updateChip(chip.id, { op: e.target.value as BasicOp })}
                  style={{ background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 4, color: c.text, fontSize: 12 }}
                >
                  {OPS.map((op) => (<option key={op} value={op}>{op}</option>))}
                </select>
                <input
                  aria-label={`Value for ${chip.field}`}
                  value={chip.values.join(', ')}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parts = chip.op === 'IN' || chip.op === 'NOT IN'
                      ? raw.split(',').map((s) => s.trim())
                      : [raw];
                    updateChip(chip.id, { values: parts });
                  }}
                  onBlur={() => setEditingId(null)}
                  autoFocus
                  style={{ background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 4, color: c.text, fontSize: 12, padding: '2px 6px', minWidth: 120 }}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingId(chip.id)}
                aria-label={`Edit ${chip.field} filter`}
                style={{ background: 'transparent', border: 'none', color: c.text, cursor: 'pointer', padding: 0, fontSize: 12, fontFamily: 'inherit' }}
              >
                <span style={{ fontWeight: 500 }}>{chip.field}</span>
                {' '}<span style={{ color: c.muted }}>{chip.op}</span>
                {' '}<span>{displayValue || <span style={{ color: c.muted }}>пусто</span>}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => removeChip(chip.id)}
              aria-label={`Remove ${chip.field} filter`}
              style={{ background: 'transparent', border: 'none', color: c.muted, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        );
      })}

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="basic-add-chip"
          onClick={() => setAddingOpen((v) => !v)}
          aria-expanded={addingOpen}
          aria-label="Добавить фильтр"
          style={{
            background: 'transparent',
            border: `1px dashed ${c.border}`,
            color: c.acc,
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          + Добавить фильтр
        </button>
        {addingOpen && (
          <div
            role="menu"
            data-testid="basic-add-menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              background: c.panel,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              padding: 8,
              zIndex: 10,
              minWidth: 220,
              maxHeight: 360,
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              fontSize: 12,
            }}
          >
            {CATEGORIES.map((cat) => (
              <div key={cat.key} style={{ marginBottom: 8 }}>
                <div style={{ color: c.muted, fontSize: 11, padding: '2px 6px', textTransform: 'uppercase' }}>{cat.label}</div>
                {cat.fields.map((field) => (
                  <button
                    key={field}
                    type="button"
                    role="menuitem"
                    onClick={() => addChip(field)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: c.text,
                      padding: '4px 6px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    {field}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
