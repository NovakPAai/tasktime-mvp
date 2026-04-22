/**
 * TTSRH-1 PR-14 — ColumnConfigurator.
 *
 * Два списка: Available / Selected. Drag-n-drop через native HTML5 DnD API
 * (без react-dnd dependency — 11ч эстимат не позволяет добавлять heavy libs).
 *
 * Публичный API:
 *   • available — имена всех доступных колонок (system + custom).
 *   • primary — подмножество `available`, которое показывается по умолчанию
 *     (обычно — системные поля). Нужен, чтобы при большом каталоге
 *     кастомных полей не выгружать весь список; JIRA-подобный UX: пустой
 *     поисковый ввод = только primary, ввод → фильтр по всем `available`.
 *   • getLabel — опциональный human-readable label для отображения.
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
import { useCallback, useMemo, useState } from 'react';

export interface ColumnConfiguratorProps {
  available: string[];
  /**
   * Подмножество `available`, показываемое при пустом поиске. Если не задано
   * — показываются все `available` (старое поведение). При наборе в поисковом
   * поле фильтр работает поверх всего `available`.
   */
  primary?: string[];
  getLabel?: (name: string) => string;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose?: () => void;
  isLight?: boolean;
}

type DragFrom = 'available' | { list: 'selected'; index: number };

export default function ColumnConfigurator({
  available,
  primary,
  getLabel,
  selected,
  onChange,
  onClose,
  isLight = false,
}: ColumnConfiguratorProps) {
  const [dragData, setDragData] = useState<{ name: string; from: DragFrom } | null>(null);
  const [query, setQuery] = useState('');

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
      // After splice(-1), indices above srcIdx shift left by 1. Compensate so
      // a drag from index 1 to drop-at-4 actually lands at index 4 (not 5).
      let insertAt = dropIndex ?? next.length;
      if (insertAt > srcIdx) insertAt -= 1;
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

  const labelFor = useCallback(
    (name: string): string => getLabel?.(name) ?? name,
    [getLabel],
  );
  const trimmed = query.trim().toLowerCase();
  // Empty query + primary set defined → only show primary names, so a huge
  // custom-field catalogue (could be 100+ fields across all projects in the
  // search results) doesn't dump into the UI. Typing widens the search to
  // all `available`, matching JIRA's column-picker behaviour.
  const visibleAvailable = useMemo(() => {
    const base = trimmed === '' && primary ? primary : available;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of base) {
      if (selectedSet.has(name)) continue;
      if (seen.has(name)) continue;
      if (trimmed !== '') {
        const hay = `${name} ${labelFor(name)}`.toLowerCase();
        if (!hay.includes(trimmed)) continue;
      }
      seen.add(name);
      out.push(name);
    }
    return out;
  }, [trimmed, primary, available, selectedSet, labelFor]);
  const hiddenCount =
    trimmed === '' && primary
      ? available.filter((n) => !primary.includes(n) && !selectedSet.has(n)).length
      : 0;

  return (
    <div data-testid="column-configurator" style={{ display: 'flex', gap: 12, minWidth: 400 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: c.muted, marginBottom: 6, textTransform: 'uppercase' }}>
          Доступные
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск поля…"
          data-testid="col-search"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: 6,
            padding: '4px 8px',
            fontSize: 12,
            border: `1px solid ${c.border}`,
            borderRadius: 4,
            background: 'transparent',
            color: c.text,
            fontFamily: 'inherit',
          }}
        />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropToAvailable}
          style={{ minHeight: 120, maxHeight: 300, overflowY: 'auto' }}
        >
          {visibleAvailable.map((name) => (
            <div
              key={name}
              draggable
              onDragStart={onDragStart(name, 'available')}
              style={cellStyle}
              data-testid={`col-available-${name}`}
            >
              <span>{labelFor(name)}</span>
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
          {visibleAvailable.length === 0 && (
            <div style={{ color: c.muted, fontSize: 11, padding: 8 }}>
              {trimmed ? 'Ничего не найдено' : 'Все поля уже добавлены'}
            </div>
          )}
          {hiddenCount > 0 && (
            <div style={{ color: c.muted, fontSize: 11, padding: '6px 2px' }}>
              Ещё {hiddenCount} {pluralize(hiddenCount, 'поле', 'поля', 'полей')} — начните вводить для поиска
            </div>
          )}
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
                {labelFor(name)}
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

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
