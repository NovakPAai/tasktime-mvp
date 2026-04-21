/**
 * TTSRH-1 PR-10 — lazy-wrapper для JqlEditor.
 *
 * Зачем отдельный файл: `React.lazy` принимает только default-экспорт. Путь к
 * реальному модулю (`./JqlEditor`) разрешается через dynamic import, и Vite
 * разносит CodeMirror в отдельный chunk (~60-100KB gzip). На /search chunk
 * остаётся в пределах NFR-5 бюджета (≤160KB gzip), а на остальных страницах
 * CM не грузится вообще.
 *
 * Suspense fallback — лёгкий визуальный placeholder (placeholder-высота
 * соответствует реальному редактору, чтобы избежать layout-shift при
 * подгрузке).
 */
import { lazy, Suspense } from 'react';
import type { JqlEditorProps } from './JqlEditor';

const LazyEditor = lazy(() => import('./JqlEditor'));

function EditorFallback({ isLight }: { isLight?: boolean }) {
  const bg = isLight ? '#FAFBFC' : '#0F1320';
  const border = isLight ? '#D0D7DE' : '#21262D';
  const t3 = isLight ? '#656D76' : '#8B949E';
  return (
    <div
      data-testid="jql-editor-loading"
      style={{
        minHeight: 64,
        padding: '10px 12px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        color: t3,
        fontSize: 12,
        fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      }}
    >
      Загрузка редактора…
    </div>
  );
}

export default function JqlEditorLazy(props: JqlEditorProps) {
  return (
    <Suspense fallback={<EditorFallback isLight={props.isLight} />}>
      <LazyEditor {...props} />
    </Suspense>
  );
}
