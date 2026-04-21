/**
 * TTSRH-1 PR-10 — CodeMirror 6 редактор для TTS-QL.
 *
 * Лениво импортируется в SearchPage через `React.lazy` — CodeMirror весит ~60KB gzip,
 * и пока пользователь на других страницах мы не грузим его. Lazy-wrapper живёт в
 * отдельном файле (JqlEditor.lazy.tsx), чтобы Vite разнёс chunk'и корректно.
 *
 * Публичный API:
 *   • value — текущий JQL.
 *   • onChange(value) — обновить родительский state.
 *   • onSubmit(value) — вызвать на `Ctrl/Cmd+Enter`.
 *   • errors — список `{start, end, message}` для squiggle-декораций.
 *   • variant — 'default' | 'checkpoint' (прокидывается в validate хуке).
 *
 * Инварианты:
 *   • `Ctrl/Cmd+Enter` → submit. Plain Enter → newline (multi-line OK).
 *   • `/` (вне инпута) → focus editor (A11Y-1). Регистрируется глобально.
 *   • Squiggle-декорации через `Decoration.mark` на диапазоне `[start, end]`.
 *   • Theme adapts к light/dark через `EditorView.theme`.
 *   • Не throws на невалидных `errors[i].start > end` — фильтрует молча.
 */
import { useEffect, useMemo, useRef } from 'react';
import { EditorView, keymap, Decoration, placeholder as cmPlaceholder, type DecorationSet } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { searchKeymap } from '@codemirror/search';

import { ttqlLanguage } from './ttql-language';
import { DEFAULT_TRIGGER_CHARS, ttqlCompletionSource } from './ttql-completion';

export interface InlineError {
  start: number;
  end: number;
  message: string;
}

export interface JqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  errors?: InlineError[];
  isLight?: boolean;
  placeholder?: string;
  /** Stable id used for the aria-describedby link to a sibling status/error node. */
  ariaDescribedBy?: string;
}

const setErrorsEffect = StateEffect.define<InlineError[]>();

const errorsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorsEffect)) {
        const docLen = tr.state.doc.length;
        const marks = e.value
          .filter((err) => err.start >= 0 && err.end > err.start && err.end <= docLen)
          .map((err) =>
            Decoration.mark({
              class: 'ttql-error',
              attributes: { title: err.message },
            }).range(err.start, err.end),
          );
        deco = Decoration.set(marks, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const errorTheme = EditorView.baseTheme({
  '.ttql-error': {
    textDecoration: 'underline wavy #e5484d',
    textUnderlineOffset: '3px',
  },
});

function buildTheme(isLight: boolean) {
  return EditorView.theme(
    {
      '&': {
        fontSize: '13px',
        fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
        background: isLight ? '#FAFBFC' : '#0F1320',
        color: isLight ? '#1F2328' : '#E2E8F8',
        borderRadius: '6px',
        border: `1px solid ${isLight ? '#D0D7DE' : '#21262D'}`,
      },
      '&.cm-focused': {
        outline: 'none',
        borderColor: '#4F6EF7',
        boxShadow: '0 0 0 2px rgba(79,110,247,0.25)',
      },
      '.cm-content': { padding: '10px 12px', minHeight: '64px' },
      '.cm-line': { padding: '0' },
      '.cm-placeholder': { color: isLight ? '#656D76' : '#8B949E' },
    },
    { dark: !isLight },
  );
}

export default function JqlEditor({
  value,
  onChange,
  onSubmit,
  errors = [],
  isLight = false,
  placeholder = 'project = "TTMP" AND assignee = currentUser()',
  ariaDescribedBy,
}: JqlEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSubmitRef = useRef(onSubmit);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Stable extensions — initialized once per mount.
  const extensions = useMemo(
    () => [
      history(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      errorsField,
      errorTheme,
      buildTheme(isLight),
      ttqlLanguage(),
      cmPlaceholder(placeholder),
      autocompletion({
        override: [ttqlCompletionSource(DEFAULT_TRIGGER_CHARS)],
        activateOnTyping: true,
        closeOnBlur: true,
        maxRenderedOptions: 50,
        defaultKeymap: false, // we merge completionKeymap manually below
      }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': 'JQL / TTS-QL query editor',
        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
      }),
      EditorState.tabSize.of(2),
      keymap.of([
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: (view) => {
            onSubmitRef.current(view.state.doc.toString());
            return true;
          },
        },
        ...completionKeymap,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ],
    // Rebuild on theme/aria/placeholder change. Language/history/etc. are stable.
    [isLight, ariaDescribedBy, placeholder],
  );

  // Mount once per extensions-signature.
  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensions]);

  // Sync external `value` changes (e.g. URL-driven) into the editor only if different.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  // Push `errors` into the editor via StateEffect.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setErrorsEffect.of(errors) });
  }, [errors]);

  // Global `/` → focus editor. Respect input/textarea focus so the slash stays a char.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.closest('.cm-editor');
      if (isInput) return;
      e.preventDefault();
      viewRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="jql-editor"
      data-placeholder={placeholder}
      style={{ minHeight: 64 }}
    />
  );
}
