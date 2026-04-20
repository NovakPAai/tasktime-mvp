import { useThemeStore } from '../store/theme.store';

/**
 * TTSRH-1 PR-1 — placeholder-страница «Поиск задач». Роут /search смонтирован условно
 * в App.tsx под `features.advancedSearch`, поэтому сюда попадают только сборки, где
 * флаг включён. До merge PR-9 (SearchPage shell) здесь рендерится «под разработкой»-
 * сообщение, чтобы UAT-стейдж мог проверить факт мaunting и активный-пункт сайдбара.
 * Полная реализация — §5.7 в docs/tz/TTSRH-1.md и PR-9..PR-14 в §13.6 ТЗ.
 */
export default function SearchPage() {
  const { mode } = useThemeStore();
  const isLight = mode === 'light';
  const c = isLight
    ? { bg: '#F6F8FA', t1: '#1F2328', t3: '#656D76', border: '#D0D7DE' }
    : { bg: '#080B14', t1: '#E2E8F8', t3: '#8B949E', border: '#21262D' };

  return (
    <div
      data-testid="search-page"
      style={{
        minHeight: '100%',
        padding: '32px 24px',
        fontFamily: '"Inter", system-ui, sans-serif',
        color: c.t1,
        background: c.bg,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Поиск задач</h1>
      <p style={{ fontSize: 14, color: c.t3, marginBottom: 24, maxWidth: 640 }}>
        Продвинутый поиск с TTS-QL (TaskTime Query Language) — внутренним языком запросов,
        совместимым с JQL. Страница находится в разработке по тикету TTSRH-1.
      </p>
      <div
        style={{
          padding: '20px 24px',
          border: `1px dashed ${c.border}`,
          borderRadius: 10,
          maxWidth: 640,
          fontSize: 13,
          lineHeight: 1.6,
          color: c.t3,
        }}
      >
        Готовность: <b style={{ color: c.t1 }}>foundation merged</b>. Редактор TTS-QL,
        сохранённые фильтры, конструктор Basic и массовые действия появятся в последующих
        PR — см. <code>docs/tz/TTSRH-1.md §13.6</code>.
      </div>
    </div>
  );
}
