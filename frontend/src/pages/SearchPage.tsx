/**
 * TTSRH-1 PR-9 — SearchPage shell с 3-колоночным layout + URL-синхронизацией.
 *
 * Сейчас (shell): placeholder'ы для SidebarFilters | ResultsArea | DetailPreview.
 * Реальное наполнение поступает в PR-10 (JqlEditor + inline errors), PR-12
 * (BasicFilterBuilder), PR-13 (SavedFiltersSidebar + modals) и PR-14
 * (ColumnConfigurator + ResultsTable + BulkActionsBar + ExportMenu).
 *
 * Что уже live:
 *   • Роут `/search` + `/search/saved/:filterId` (App.tsx).
 *   • 3-column CSS grid layout (320px | fr | 360px).
 *   • URL state `?jql=&view=&columns=&page=` через useSearchUrlState.
 *   • Fetch SavedFilter при `/search/saved/:id` — заменяет state из URL.
 *   • Submit по Enter / Ctrl+Enter (оба variant'а, UX-resilient).
 *
 * Инварианты:
 *   • Пустой `jql` допустим (ничего не выполняется, results area показывает hint).
 *   • Обработка ошибок `/search/issues` → `ResultsArea` показывает статус-строкой,
 *     не throw — страница должна продолжать работать после неудачного запроса.
 *   • a11y (A11Y-1): errors и status-messages идут через `role="status"`/`aria-live`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { searchIssues, type IssueSearchRow } from '../api/search';
import { getSavedFilter, markSavedFilterUsed } from '../api/savedFilters';
import JqlEditor from '../components/search/JqlEditor.lazy';
import { useThemeStore } from '../store/theme.store';
import { useSearchUrlState } from './search/useSearchUrlState';
import { useJqlValidation } from './search/useJqlValidation';

type LoadState = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; total: number; issues: IssueSearchRow[] } | { status: 'error'; message: string };

const PAGE_SIZE = 50;

export default function SearchPage() {
  const { mode } = useThemeStore();
  const isLight = mode === 'light';
  const { filterId } = useParams<{ filterId?: string }>();
  const { state, updateUrl } = useSearchUrlState();
  const [jqlDraft, setJqlDraft] = useState(state.jql);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const { errors: inlineErrors, isValidating } = useJqlValidation(jqlDraft);

  // Sync draft when URL changes (browser back/forward).
  useEffect(() => {
    setJqlDraft(state.jql);
  }, [state.jql]);

  // Load saved filter when `/search/saved/:filterId` route is used.
  useEffect(() => {
    if (!filterId) return;
    let cancelled = false;
    (async () => {
      try {
        const filter = await getSavedFilter(filterId);
        if (cancelled) return;
        updateUrl({ jql: filter.jql, columns: filter.columns ?? [], page: 1 }, { push: false });
        // Fire-and-forget increment of useCount/lastUsedAt.
        markSavedFilterUsed(filterId).catch(() => undefined);
      } catch {
        if (!cancelled) setLoad({ status: 'error', message: 'Фильтр не найден или недоступен' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterId, updateUrl]);

  const runQuery = useCallback(
    async (jql: string, page: number) => {
      if (!jql.trim()) {
        setLoad({ status: 'idle' });
        return;
      }
      setLoad({ status: 'loading' });
      try {
        const startAt = (page - 1) * PAGE_SIZE;
        const out = await searchIssues(jql, { startAt, limit: PAGE_SIZE });
        setLoad({ status: 'ok', total: out.total, issues: out.issues });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка выполнения';
        setLoad({ status: 'error', message: msg });
      }
    },
    [],
  );

  // Run on URL-driven state change.
  useEffect(() => {
    void runQuery(state.jql, state.page);
  }, [state.jql, state.page, runQuery]);

  const submit = useCallback(() => {
    updateUrl({ jql: jqlDraft.trim(), page: 1 }, { push: true });
  }, [jqlDraft, updateUrl]);

  // ─── Styles (Paper-like tokens, inline — matches Sidebar.tsx) ───────────
  const c = useMemo(
    () =>
      isLight
        ? { bg: '#F6F8FA', panel: '#FFFFFF', border: '#D0D7DE', t1: '#1F2328', t2: '#424A53', t3: '#656D76', acc: '#4F6EF7' }
        : { bg: '#080B14', panel: '#0F1320', border: '#21262D', t1: '#E2E8F8', t2: '#B1BAC4', t3: '#8B949E', acc: '#4F6EF7' },
    [isLight],
  );

  return (
    <div
      data-testid="search-page"
      style={{
        minHeight: '100%',
        padding: '16px 20px',
        background: c.bg,
        color: c.t1,
        fontFamily: '"Inter", system-ui, sans-serif',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Поиск задач</h1>
        <div style={{ color: c.t3, fontSize: 12 }}>
          TTS-QL · <a href="https://github.com/NovakPAai/tasktime-mvp/blob/main/docs/tz/TTSRH-1.md" target="_blank" rel="noreferrer" style={{ color: c.acc }}>справка</a>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px minmax(0, 1fr) 360px',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        {/* Column 1 — Sidebar (PR-13: saved filters list) */}
        <aside
          data-testid="search-sidebar"
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: 16,
            minHeight: 480,
            color: c.t3,
          }}
        >
          <div style={{ fontWeight: 600, color: c.t1, marginBottom: 6, fontSize: 13 }}>Мои фильтры</div>
          <div style={{ fontSize: 12 }}>
            Список сохранённых фильтров появится в PR-13 (§13.6 ТЗ).
          </div>
        </aside>

        {/* Column 2 — Main (editor + results) */}
        <main
          data-testid="search-main"
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            {/* CM6 editor provides its own aria-label on the contenteditable node;
                this visual label is purely decorative (aria-hidden) to avoid a
                dangling htmlFor association. */}
            <div aria-hidden="true" style={{ fontSize: 12, color: c.t3, marginBottom: 6 }}>
              JQL / TTS-QL <span style={{ color: c.t3, fontSize: 11 }}>(/ — фокус, Ctrl/Cmd+Enter — выполнить)</span>
            </div>
            <JqlEditor
              value={jqlDraft}
              onChange={setJqlDraft}
              onSubmit={(v) => updateUrl({ jql: v.trim(), page: 1 }, { push: true })}
              errors={inlineErrors}
              isLight={isLight}
              ariaDescribedBy="jql-status-line"
            />
            {inlineErrors.length > 0 && (
              <ul
                data-testid="jql-error-banner"
                role="alert"
                aria-live="polite"
                style={{
                  listStyle: 'none',
                  padding: '8px 10px',
                  margin: '6px 0 0',
                  border: `1px solid #e5484d`,
                  borderRadius: 6,
                  background: isLight ? '#fef0f0' : '#2d1414',
                  color: '#e5484d',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {inlineErrors.slice(0, 5).map((err, i) => (
                  <li key={`${err.start}-${err.end}-${i}`}>
                    <strong>[{err.start}:{err.end}]</strong> {err.message}
                  </li>
                ))}
                {inlineErrors.length > 5 && (
                  <li style={{ color: c.t3 }}>…ещё {inlineErrors.length - 5} ошибок.</li>
                )}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button
                data-testid="search-run"
                onClick={submit}
                style={{
                  background: c.acc,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Выполнить
              </button>
              <div id="jql-status-line" role="status" aria-live="polite" style={{ color: c.t3, fontSize: 12, display: 'flex', gap: 8 }}>
                {isValidating && <span>Проверка запроса…</span>}
                {!isValidating && load.status === 'idle' && <span>Введите запрос и нажмите Ctrl+Enter</span>}
                {load.status === 'loading' && <span>Выполняется…</span>}
                {!isValidating && load.status === 'ok' && <span>Найдено: {load.total}</span>}
                {!isValidating && load.status === 'error' && <span style={{ color: '#e5484d' }}>Ошибка: {load.message}</span>}
              </div>
            </div>
          </div>

          <div
            data-testid="search-results"
            style={{
              flex: 1,
              borderTop: `1px solid ${c.border}`,
              paddingTop: 12,
              minHeight: 240,
            }}
          >
            {load.status === 'ok' ? (
              <SearchResultsPreview issues={load.issues} color={c} />
            ) : (
              <div style={{ color: c.t3, fontSize: 12 }}>
                Результаты появятся здесь. Полноценная таблица (сортировка, bulk-actions, экспорт) — в PR-14.
              </div>
            )}
          </div>
        </main>

        {/* Column 3 — Detail preview (PR-14) */}
        <aside
          data-testid="search-preview"
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: 16,
            minHeight: 480,
            color: c.t3,
            fontSize: 12,
          }}
        >
          Preview задачи появится в PR-14.
        </aside>
      </div>
    </div>
  );
}

function SearchResultsPreview({
  issues,
  color,
}: {
  issues: IssueSearchRow[];
  color: { panel: string; border: string; t1: string; t2: string; t3: string; acc: string };
}) {
  if (issues.length === 0) {
    return <div style={{ color: color.t3, fontSize: 12 }}>Нет задач, удовлетворяющих запросу.</div>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {issues.slice(0, 20).map((issue) => {
        const keyLabel = `${issue.project.key}-${issue.number}`;
        return (
          <li
            key={issue.id}
            style={{
              display: 'flex',
              gap: 10,
              padding: '6px 8px',
              border: `1px solid ${color.border}`,
              borderRadius: 6,
              fontSize: 13,
              color: color.t1,
            }}
          >
            <span style={{ fontFamily: '"JetBrains Mono", monospace', color: color.acc, minWidth: 80 }}>{keyLabel}</span>
            <span style={{ flex: 1 }}>{issue.title}</span>
            <span style={{ color: color.t3, fontSize: 11 }}>{issue.workflowStatus?.name ?? issue.priority ?? ''}</span>
          </li>
        );
      })}
      {issues.length > 20 && <li style={{ color: color.t3, fontSize: 12 }}>…и ещё {issues.length - 20}. Полная таблица — PR-14.</li>}
    </ul>
  );
}
