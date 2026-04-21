/**
 * TTSRH-1 PR-9 — тонкий api-клиент для /api/saved-filters/*.
 *
 * Покрывает контракт §5.6 ТЗ:
 *   • listSavedFilters(scope?) — 'mine'/'shared'/'public'/'favorite'.
 *   • getSavedFilter, createSavedFilter, updateSavedFilter, deleteSavedFilter.
 *   • setSavedFilterFavorite(id, bool), shareSavedFilter(id, {users, groups, permission}).
 *   • markSavedFilterUsed(id) — для инкремента useCount/lastUsedAt.
 */

import api from './client';

export type FilterVisibility = 'PRIVATE' | 'SHARED' | 'PUBLIC';
export type FilterPermission = 'READ' | 'WRITE';
export type SavedFilterScope = 'mine' | 'shared' | 'public' | 'favorite';

export interface SavedFilterShareView {
  id: string;
  userId: string | null;
  groupId: string | null;
  permission: FilterPermission;
}

export interface SavedFilter {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  jql: string;
  visibility: FilterVisibility;
  columns: string[] | null;
  isFavorite: boolean;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
  shares: SavedFilterShareView[];
  permission: FilterPermission;
}

export async function listSavedFilters(scope?: SavedFilterScope): Promise<SavedFilter[]> {
  const { data } = await api.get<{ filters: SavedFilter[] }>('/saved-filters', {
    params: scope ? { scope } : undefined,
  });
  return data.filters;
}

export async function getSavedFilter(id: string): Promise<SavedFilter> {
  const { data } = await api.get<SavedFilter>(`/saved-filters/${id}`);
  return data;
}

export interface CreateSavedFilterInput {
  name: string;
  description?: string | null;
  jql: string;
  visibility?: FilterVisibility;
  columns?: string[];
  sharedWith?: { users?: string[]; groups?: string[]; permission?: FilterPermission };
}

export async function createSavedFilter(input: CreateSavedFilterInput): Promise<SavedFilter> {
  const { data } = await api.post<SavedFilter>('/saved-filters', input);
  return data;
}

export interface UpdateSavedFilterInput {
  name?: string;
  description?: string | null;
  jql?: string;
  visibility?: FilterVisibility;
  columns?: string[];
}

export async function updateSavedFilter(id: string, input: UpdateSavedFilterInput): Promise<SavedFilter> {
  const { data } = await api.patch<SavedFilter>(`/saved-filters/${id}`, input);
  return data;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  await api.delete(`/saved-filters/${id}`);
}

export async function setSavedFilterFavorite(id: string, value: boolean): Promise<SavedFilter> {
  const { data } = await api.post<SavedFilter>(`/saved-filters/${id}/favorite`, { value });
  return data;
}

export interface ShareSavedFilterInput {
  users?: string[];
  groups?: string[];
  permission?: FilterPermission;
}

export async function shareSavedFilter(id: string, input: ShareSavedFilterInput): Promise<SavedFilter> {
  const { data } = await api.post<SavedFilter>(`/saved-filters/${id}/share`, input);
  return data;
}

export async function markSavedFilterUsed(id: string): Promise<void> {
  await api.post(`/saved-filters/${id}/use`);
}

// ─── User preferences ──────────────────────────────────────────────────────

// Concrete shape matches backend updatePreferencesDto. Future sections (like
// `checkpointDefaults`) should be added here explicitly as they land, rather
// than relying on an `[key: string]: unknown` escape hatch.
export interface UserPreferences {
  searchDefaults?: { columns?: string[]; pageSize?: number };
}

export async function getMyPreferences(): Promise<UserPreferences> {
  const { data } = await api.get<UserPreferences>('/users/me/preferences');
  return data;
}

export async function updateMyPreferences(patch: UserPreferences): Promise<UserPreferences> {
  const { data } = await api.patch<UserPreferences>('/users/me/preferences', patch);
  return data;
}
