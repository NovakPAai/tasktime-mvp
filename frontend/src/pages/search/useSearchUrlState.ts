/**
 * TTSRH-1 PR-9 — двусторонний bridge между URL-параметрами и локальным состоянием
 * SearchPage.
 *
 * URL-формат: `/search?jql=<url-encoded>&view=table&columns=key,status,assignee&page=2`.
 *
 * Инварианты:
 *   • `jql`/`view`/`columns`/`page` читаются на mount.
 *   • Запись в URL идёт через `navigate(url, { replace: true })` — чтобы не плодить
 *     history-entries на каждый keystroke. Первое успешное выполнение должно
 *     использовать `replace: false` (push) из вызывающего кода — отдаём контроль
 *     consumer'у через `updateUrl(state, { push })`.
 *   • `columns` — comma-separated list; каждая колонка тримится и пустые отбрасываются.
 *   • `page` — positive int, по умолчанию 1. Невалидные значения игнорируются.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type SearchView = 'table';

export interface SearchUrlState {
  jql: string;
  view: SearchView;
  columns: string[];
  page: number;
}

const DEFAULT_VIEW: SearchView = 'table';
const DEFAULT_PAGE = 1;

function parseColumns(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function parsePage(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_PAGE;
}

function parseView(raw: string | null): SearchView {
  // Only 'table' is supported in PR-9; future 'board'/'timeline' fall back to table.
  return raw === 'table' ? 'table' : DEFAULT_VIEW;
}

export function useSearchUrlState(): {
  state: SearchUrlState;
  updateUrl: (next: Partial<SearchUrlState>, opts?: { push?: boolean }) => void;
} {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const state: SearchUrlState = useMemo(
    () => ({
      jql: params.get('jql') ?? '',
      view: parseView(params.get('view')),
      columns: parseColumns(params.get('columns')),
      page: parsePage(params.get('page')),
    }),
    [params],
  );

  // `state` goes into a ref so `updateUrl` keeps a stable identity across renders.
  // Without this, any consumer effect that lists `updateUrl` in its dep array
  // would re-fire after every URL mutation and cascade into an infinite loop
  // (e.g. the `/search/saved/:filterId` fetch that calls `updateUrl` itself).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateUrl = useCallback(
    (next: Partial<SearchUrlState>, opts?: { push?: boolean }) => {
      const merged: SearchUrlState = { ...stateRef.current, ...next };
      const qs = new URLSearchParams();
      if (merged.jql) qs.set('jql', merged.jql);
      if (merged.view !== DEFAULT_VIEW) qs.set('view', merged.view);
      if (merged.columns.length > 0) qs.set('columns', merged.columns.join(','));
      if (merged.page !== DEFAULT_PAGE) qs.set('page', String(merged.page));
      const search = qs.toString();
      const url = search ? `/search?${search}` : '/search';
      navigate(url, { replace: !opts?.push });
    },
    [navigate],
  );

  // One-time self-heal: if URL has a malformed `page` value (e.g. `page=0`),
  // `parsePage` silently falls back to 1 but the URL still reads wrong. Correct
  // it on mount so the URL and the rendered state don't drift.
  useEffect(() => {
    const raw = params.get('page');
    if (raw !== null && parsePage(raw) !== Number(raw)) {
      updateUrl({ page: DEFAULT_PAGE }, { push: false });
    }
    // Only run once per mount; dep-less effects like this are intentional —
    // any subsequent URL mutation goes through our own updateUrl and is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, updateUrl };
}
