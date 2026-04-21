/**
 * TTSRH-1 PR-13 — SavedFiltersSidebar.
 *
 * Левая колонка SearchPage с 5 списками:
 *   • Мои (scope='mine')
 *   • Избранные (scope='favorite')
 *   • Общедоступные (scope='public')
 *   • Поделены со мной (scope='shared')
 *   • Недавние (client-side compute на mine + lastUsedAt DESC)
 *
 * Публичный API:
 *   • onSelectFilter(filter) — родитель навигирует на `/search/saved/:id` или
 *     заливает JQL в editor. Мы не дёргаем роутер сами чтобы sidebar оставался
 *     re-usable вне SearchPage.
 *   • onOpenShare(filter) — открыть FilterShareModal.
 *   • currentJql — чтобы подсветить соответствующий фильтр в списке (match by jql).
 *
 * Инварианты:
 *   • Mount → `loadAll()` на store.
 *   • Favorite-toggle — inline кнопка-звезда, не открывает модалку.
 *   • Delete — через `Popconfirm` (AntD), confirm → remove + reload.
 *   • Каждый section collapsible через `<details>`/`<summary>` для минимальной
 *     зависимости (no AntD Collapse).
 */
import { useEffect, useMemo, useState } from 'react';
import { Popconfirm, Tooltip, message } from 'antd';
import { StarFilled, StarOutlined, ShareAltOutlined, DeleteOutlined } from '@ant-design/icons';

import type { SavedFilter } from '../../api/savedFilters';
import { useSavedFiltersStore } from '../../store/savedFilters.store';

export interface SavedFiltersSidebarProps {
  currentJql: string;
  onSelectFilter: (filter: SavedFilter) => void;
  onOpenShare: (filter: SavedFilter) => void;
  isLight?: boolean;
}

interface Section {
  key: string;
  label: string;
  scopeKey: 'mine' | 'favorite' | 'public' | 'shared' | 'recent';
}

const SECTIONS: Section[] = [
  { key: 'mine', label: 'Мои', scopeKey: 'mine' },
  { key: 'favorite', label: 'Избранные', scopeKey: 'favorite' },
  { key: 'public', label: 'Общедоступные', scopeKey: 'public' },
  { key: 'shared', label: 'Поделены со мной', scopeKey: 'shared' },
  { key: 'recent', label: 'Недавние', scopeKey: 'recent' },
];

export default function SavedFiltersSidebar({
  currentJql,
  onSelectFilter,
  onOpenShare,
  isLight = false,
}: SavedFiltersSidebarProps) {
  const store = useSavedFiltersStore();
  const { loading, error, toggleFavorite, remove, loadAll } = store;
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['mine', 'favorite']));

  useEffect(() => {
    loadAll().catch(() => undefined);
  }, [loadAll]);

  const c = useMemo(
    () =>
      isLight
        ? { text: '#1F2328', muted: '#656D76', border: '#D0D7DE', activeBg: '#EFF4FF', activeBorder: '#C9D6F8', hover: '#F6F8FA' }
        : { text: '#E2E8F8', muted: '#8B949E', border: '#21262D', activeBg: '#1A2040', activeBorder: '#2A3260', hover: '#1A1F2E' },
    [isLight],
  );

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDelete = async (filter: SavedFilter) => {
    try {
      await remove(filter.id);
      message.success(`Фильтр «${filter.name}» удалён`);
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const handleToggleFav = async (filter: SavedFilter) => {
    try {
      await toggleFavorite(filter.id, !filter.isFavorite);
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const sectionData = (scope: Section['scopeKey']): SavedFilter[] => {
    if (scope === 'mine') return store.mine;
    if (scope === 'favorite') return store.favorite;
    if (scope === 'public') return store.public;
    if (scope === 'shared') return store.shared;
    return store.recent;
  };

  return (
    <div data-testid="saved-filters-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {loading && <div style={{ color: c.muted }}>Загрузка…</div>}
      {error && <div style={{ color: '#e5484d', fontSize: 11 }}>Ошибка: {error}</div>}
      {SECTIONS.map((section) => {
        const items = sectionData(section.scopeKey);
        const isOpen = openSections.has(section.key);
        return (
          <section key={section.key} data-testid={`sidebar-section-${section.key}`}>
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              aria-expanded={isOpen}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                color: c.text,
                fontWeight: 600,
                fontSize: 12,
                padding: '4px 0',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span>{section.label} <span style={{ color: c.muted, fontWeight: 400 }}>({items.length})</span></span>
              <span style={{ color: c.muted, fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && items.length === 0 && (
              <div style={{ color: c.muted, padding: '4px 6px', fontSize: 11 }}>— пусто —</div>
            )}
            {isOpen && items.map((f) => {
              const isActive = f.jql === currentJql && currentJql.length > 0;
              return (
                <div
                  key={f.id}
                  data-testid={`sidebar-filter-${f.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 6px',
                    border: `1px solid ${isActive ? c.activeBorder : 'transparent'}`,
                    background: isActive ? c.activeBg : 'transparent',
                    borderRadius: 4,
                    marginBottom: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFilter(f)}
                    title={f.description ?? f.jql}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: c.text,
                      fontSize: 12,
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.name}
                  </button>
                  <Tooltip title={f.isFavorite ? 'Убрать из избранного' : 'В избранное'}>
                    <button
                      type="button"
                      aria-label="favorite"
                      onClick={() => handleToggleFav(f)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: f.isFavorite ? '#F6C24C' : c.muted,
                        cursor: 'pointer',
                        padding: 2,
                        fontSize: 12,
                      }}
                    >
                      {f.isFavorite ? <StarFilled /> : <StarOutlined />}
                    </button>
                  </Tooltip>
                  {section.scopeKey === 'mine' && (
                    <Tooltip title="Поделиться">
                      <button
                        type="button"
                        aria-label="share"
                        onClick={() => onOpenShare(f)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: c.muted,
                          cursor: 'pointer',
                          padding: 2,
                          fontSize: 12,
                        }}
                      >
                        <ShareAltOutlined />
                      </button>
                    </Tooltip>
                  )}
                  {section.scopeKey === 'mine' && (
                    <Popconfirm
                      title="Удалить фильтр?"
                      onConfirm={() => handleDelete(f)}
                      okText="Удалить"
                      cancelText="Отмена"
                    >
                      <button
                        type="button"
                        aria-label="delete"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: c.muted,
                          cursor: 'pointer',
                          padding: 2,
                          fontSize: 12,
                        }}
                      >
                        <DeleteOutlined />
                      </button>
                    </Popconfirm>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
