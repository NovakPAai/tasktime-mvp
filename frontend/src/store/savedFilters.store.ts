/**
 * TTSRH-1 PR-13 — Zustand store для SavedFilters UI.
 *
 * Публичный API:
 *   • state: `{mine, favorite, public, shared, recent, loading, error}` — 5 scope'ов
 *     из §5.7 ТЗ + loading/error для UX.
 *   • load(scope?) — fetch one or all scopes.
 *   • loadAll() — параллельный fetch всех 5 scope'ов.
 *   • create/update/delete/toggleFavorite/share — proxy к api/savedFilters.
 *   • «Недавние» вычисляются из `mine` сортировкой по `lastUsedAt DESC` (client-side —
 *     backend не имеет специального scope'а `recent`). Пустой `lastUsedAt` кладётся
 *     в конец.
 *
 * Инварианты:
 *   • Все мутации завершаются `loadAll()` чтобы состояние 5 списков было
 *     согласованным (filter может переехать из `mine` в `shared` после share).
 *   • Ошибки сохраняются в `error`, но не throw'ются — UI решает как показывать.
 *   • `scope='recent'` не проходит в backend, он вычисляется локально.
 */

import { create } from 'zustand';

import {
  createSavedFilter,
  deleteSavedFilter,
  listSavedFilters,
  setSavedFilterFavorite,
  shareSavedFilter,
  updateSavedFilter,
  type CreateSavedFilterInput,
  type SavedFilter,
  type SavedFilterScope,
  type ShareSavedFilterInput,
  type UpdateSavedFilterInput,
} from '../api/savedFilters';

export type SidebarScope = 'mine' | 'favorite' | 'public' | 'shared' | 'recent';

interface SavedFiltersState {
  mine: SavedFilter[];
  favorite: SavedFilter[];
  public: SavedFilter[];
  shared: SavedFilter[];
  /** Derived client-side from `mine` sorted by lastUsedAt DESC (null last). */
  recent: SavedFilter[];
  loading: boolean;
  error: string | null;

  load: (scope: SavedFilterScope) => Promise<void>;
  loadAll: () => Promise<void>;
  create: (input: CreateSavedFilterInput) => Promise<SavedFilter>;
  update: (id: string, input: UpdateSavedFilterInput) => Promise<SavedFilter>;
  remove: (id: string) => Promise<void>;
  toggleFavorite: (id: string, value: boolean) => Promise<void>;
  share: (id: string, input: ShareSavedFilterInput) => Promise<void>;
}

function computeRecent(mine: SavedFilter[]): SavedFilter[] {
  return [...mine]
    .sort((a, b) => {
      const at = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : -Infinity;
      const bt = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : -Infinity;
      return bt - at;
    })
    .slice(0, 10);
}

export const useSavedFiltersStore = create<SavedFiltersState>((set) => ({
  mine: [],
  favorite: [],
  public: [],
  shared: [],
  recent: [],
  loading: false,
  error: null,

  load: async (scope) => {
    set({ loading: true, error: null });
    try {
      const data = await listSavedFilters(scope);
      const patch: Partial<SavedFiltersState> = { [scope]: data };
      if (scope === 'mine') patch.recent = computeRecent(data);
      set({ ...patch, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      set({ loading: false, error: msg });
    }
  },

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [mine, favorite, pub, shared] = await Promise.all([
        listSavedFilters('mine'),
        listSavedFilters('favorite'),
        listSavedFilters('public'),
        listSavedFilters('shared'),
      ]);
      set({
        mine,
        favorite,
        public: pub,
        shared,
        recent: computeRecent(mine),
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      // Clear lists on failure so stale data isn't shown next to the error banner.
      set({ loading: false, error: msg, mine: [], favorite: [], public: [], shared: [], recent: [] });
    }
  },

  // Mutations return the API response but DO NOT call loadAll — the caller
  // (modal's onSaved / onClose) is the single refresh trigger per CLAUDE.md
  // modal-refresh rule. This eliminates double-fetch (8 parallel HTTP roundtrips
  // per save action).
  create: async (input) => {
    return await createSavedFilter(input);
  },

  update: async (id, input) => {
    return await updateSavedFilter(id, input);
  },

  remove: async (id) => {
    await deleteSavedFilter(id);
  },

  toggleFavorite: async (id, value) => {
    await setSavedFilterFavorite(id, value);
  },

  share: async (id, input) => {
    await shareSavedFilter(id, input);
  },
}));
