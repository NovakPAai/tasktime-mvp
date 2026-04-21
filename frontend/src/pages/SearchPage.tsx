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
import { getSavedFilter, markSavedFilterUsed, type SavedFilter } from '../api/savedFilters';
import BasicFilterBuilder from '../components/search/BasicFilterBuilder';
import { canBasicize } from '../components/search/basic-filter-model';
import FilterModeToggle, { type FilterMode } from '../components/search/FilterModeToggle';
import FilterShareModal from '../components/search/FilterShareModal';
import JqlEditor from '../components/search/JqlEditor.lazy';
import SaveFilterModal from '../components/search/SaveFilterModal';
import SavedFiltersSidebar from '../components/search/SavedFiltersSidebar';
import { useSavedFiltersStore } from '../store/savedFilters.store';
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
  const [filterMode, setFilterMode] = useState<FilterMode>('advanced');
  const basicCheck = useMemo(() => canBasicize(jqlDraft), [jqlDraft]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalInitial, setSaveModalInitial] = useState<SavedFilter | null>(null);
  const [shareModalFilter, setShareModalFilter] = useState<SavedFilter | null>(null);
  const loadAllSavedFilters = useSavedFiltersStore((s) => s.loadAll);

  const openSaveModal = useCallback(() => {
    setSaveModalInitial(null);
    setSaveModalOpen(true);
  }, []);

  // Ctrl/Cmd+S → Save. preventDefault чтобы не триггерить browser "Save Page".
  // Skip when focus is inside another form control (AntD modal inputs etc.) —
  // исключение: CM6 JqlEditor (`.cm-editor`), там Ctrl+S должен сохранять.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 's') return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const isEditable = el?.getAttribute('contenteditable') === 'true';
      const isCmEditor = el?.closest('.cm-editor') != null;
      if (!isCmEditor && (tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable)) return;
      ev.preventDefault();
      if (!jqlDraft.trim()) return;
      openSaveModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jqlDraft, openSaveModal]);
  // Auto-switch to Advanced if current JQL can't be basicized (e.g. user loaded a
  // saved filter with OR/NOT). Reverse not enforced — user may manually switch.
  useEffect(() => {
    if (filterMode === 'basic' && !basicCheck.ok) setFilterMode('advanced');
  }, [filterMode, basicCheck.ok]);

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
        {/* Column 1 — SavedFiltersSidebar */}
        <aside
          data-testid="search-sidebar"
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: 12,
            minHeight: 480,
            color: c.t1,
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 120px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, color: c.t1, fontSize: 13 }}>Фильтры</div>
            <button
              type="button"
              onClick={openSaveModal}
              disabled={!jqlDraft.trim()}
              aria-label="Сохранить текущий фильтр"
              title={jqlDraft.trim() ? 'Сохранить (Ctrl+S)' : 'Введите JQL для сохранения'}
              data-testid="sidebar-save-filter"
              style={{
                background: jqlDraft.trim() ? c.acc : 'transparent',
                color: jqlDraft.trim() ? '#fff' : c.t3,
                border: `1px solid ${jqlDraft.trim() ? c.acc : c.border}`,
                borderRadius: 5,
                padding: '3px 10px',
                fontSize: 11,
                cursor: jqlDraft.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              + Сохранить
            </button>
          </div>
          <SavedFiltersSidebar
            currentJql={state.jql}
            isLight={isLight}
            onSelectFilter={(f) => {
              updateUrl({ jql: f.jql, columns: f.columns ?? [], page: 1 }, { push: true });
              markSavedFilterUsed(f.id).catch(() => undefined);
            }}
            onOpenShare={(f) => setShareModalFilter(f)}
          />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
              {/* CM6 editor provides its own aria-label on the contenteditable node;
                  this visual label is purely decorative (aria-hidden) to avoid a
                  dangling htmlFor association. */}
              <div aria-hidden="true" style={{ fontSize: 12, color: c.t3 }}>
                {filterMode === 'advanced'
                  ? <>JQL / TTS-QL <span style={{ color: c.t3, fontSize: 11 }}>(/ — фокус, Ctrl/Cmd+Enter — выполнить)</span></>
                  : 'Basic-фильтры'}
              </div>
              <FilterModeToggle
                mode={filterMode}
                onChange={setFilterMode}
                basicDisabled={!basicCheck.ok}
                basicDisabledReason={basicCheck.reason}
                isLight={isLight}
              />
            </div>
            {filterMode === 'basic' ? (
              <BasicFilterBuilder value={jqlDraft} onChange={setJqlDraft} isLight={isLight} />
            ) : (
              <JqlEditor
                value={jqlDraft}
                onChange={setJqlDraft}
                onSubmit={(v) => updateUrl({ jql: v.trim(), page: 1 }, { push: true })}
                errors={inlineErrors}
                isLight={isLight}
                ariaDescribedBy="jql-status-line"
              />
            )}
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

      <SaveFilterModal
        open={saveModalOpen}
        onClose={() => {
          setSaveModalOpen(false);
          void loadAllSavedFilters(); // CLAUDE.md rule: onClose → reload parent data
        }}
        onSaved={(f) => {
          setSaveModalOpen(false);
          updateUrl({ jql: f.jql, columns: f.columns ?? [], page: 1 }, { push: false });
          void loadAllSavedFilters();
        }}
        initial={saveModalInitial}
        currentJql={jqlDraft}
      />
      <FilterShareModal
        open={shareModalFilter !== null}
        filter={shareModalFilter}
        onClose={() => {
          setShareModalFilter(null);
          void loadAllSavedFilters();
        }}
        onSaved={() => {
          setShareModalFilter(null);
          void loadAllSavedFilters();
        }}
      />
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
