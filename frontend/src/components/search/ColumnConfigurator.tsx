/**
 * TTSRH-1 PR-14 — ColumnConfigurator.
 *
 * Два списка: Available / Selected. Drag-n-drop через native HTML5 DnD API
 * (без react-dnd dependency — 11ч эстимат не позволяет добавлять heavy libs).
 *
 * Публичный API:
 *   • available — имена всех доступных колонок (system + custom).
 *   • selected — текущие selected columns.
 *   • onChange(selected) — новый порядок/набор.
 *   • onClose — закрыть popover.
 *
 * Инварианты:
 *   • Drag between lists + drag within Selected-list (reorder).
 *   • `selected` сохраняется в порядке drop'а.
 *   • `available` (left list) всегда показывается в фиксированном order'е.
 *   • Duplicate guard: drop одного имени дважды в Selected — игнорируется.
 */
import { useCallback, useState } from 'react';

export interface ColumnConfiguratorProps {
  available: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose?: () => void;
  isLight?: boolean;
}

type DragFrom = 'available' | { list: 'selected'; index: number };

export default function ColumnConfigurator({
  available,
  selected,
  onChange,
  onClose,
  isLight = false,
}: ColumnConfiguratorProps) {
  const [dragData, setDragData] = useState<{ name: string; from: DragFrom } | null>(null);

  const c = isLight
    ? { text: '#1F2328', border: '#D0D7DE', muted: '#656D76', hover: '#F6F8FA', selected: '#EFF4FF' }
    : { text: '#E2E8F8', border: '#21262D', muted: '#8B949E', hover: '#1A1F2E', selected: '#1A2040' };

  const selectedSet = new Set(selected);

  const onDragStart = (name: string, from: DragFrom) => (e: React.DragEvent) => {
    setDragData({ name, from });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
  };

  const onDropToSelected = (dropIndex: number | null) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragData) return;
    const { name, from } = dragData;
    let next = [...selected];
    if (from === 'available') {
      if (selectedSet.has(name)) return;
      if (dropIndex === null) next.push(name);
      else next.splice(dropIndex, 0, name);
    } else {
      // reorder within selected
      const srcIdx = from.index;
      if (srcIdx < 0 || srcIdx >= next.length) return;
      const [item] = next.splice(srcIdx, 1);
      let insertAt = dropIndex ?? next.length;
      if (insertAt > srcIdx) insertAt -= 0; // after removal indices shift left — but we already removed
      next.splice(insertAt, 0, item!);
    }
    onChange(next);
    setDragData(null);
  };

  const onDropToAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragData) return;
    if (dragData.from === 'available') return;
    onChange(selected.filter((s) => s !== dragData.name));
    setDragData(null);
  };

  const remove = useCallback(
    (name: string) => onChange(selected.filter((s) => s !== name)),
    [selected, onChange],
  );

  const cellStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: `1px solid ${c.border}`,
    borderRadius: 4,
    fontSize: 12,
    color: c.text,
    background: 'transparent',
    cursor: 'grab',
    fontFamily: 'inherit',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  };

  return (
    <div data-testid="column-configurator" style={{ display: 'flex', gap: 12, minWidth: 400 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: c.muted, marginBottom: 6, textTransform: 'uppercase' }}>
          Доступные
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropToAvailable}
          style={{ minHeight: 120, maxHeight: 300, overflowY: 'auto' }}
        >
          {available
            .filter((n) => !selectedSet.has(n))
            .map((name) => (
              <div
                key={name}
                draggable
                onDragStart={onDragStart(name, 'available')}
                style={cellStyle}
                data-testid={`col-available-${name}`}
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => onChange([...selected, name])}
                  aria-label={`Add ${name}`}
                  style={{ background: 'transparent', border: 'none', color: c.muted, cursor: 'pointer', fontSize: 13 }}
                >
                  →
                </button>
              </div>
            ))}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: c.muted, marginBottom: 6, textTransform: 'uppercase' }}>
          Выбранные ({selected.length})
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropToSelected(null)}
          style={{ minHeight: 120, maxHeight: 300, overflowY: 'auto' }}
        >
          {selected.map((name, index) => (
            <div
              key={name}
              draggable
              onDragStart={onDragStart(name, { list: 'selected', index })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropToSelected(index)}
              style={{ ...cellStyle, background: c.selected }}
              data-testid={`col-selected-${name}`}
            >
              <span>
                <span style={{ color: c.muted, marginRight: 6 }}>⋮⋮</span>
                {name}
              </span>
              <button
                type="button"
                onClick={() => remove(name)}
                aria-label={`Remove ${name}`}
                style={{ background: 'transparent', border: 'none', color: c.muted, cursor: 'pointer', fontSize: 13 }}
              >
                ×
              </button>
            </div>
          ))}
          {selected.length === 0 && (
            <div style={{ color: c.muted, fontSize: 11, padding: 8 }}>Перетащите колонки сюда</div>
          )}
        </div>
        {onClose && (
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: `1px solid ${c.border}`,
                color: c.text,
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Готово
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
