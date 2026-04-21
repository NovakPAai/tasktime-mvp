/**
 * TTSRH-1 PR-11 — CodeMirror 6 CompletionSource adapter для `/search/suggest`.
 *
 * Контракт:
 *   • Триггерится на:
 *     — любой символ идентификатора (a-z), чтобы подхватывать inline-автокомплит во время ввода;
 *     — после специальных токенов `=`/`!=`/`,`/`(` (explicit) — `explicit: true` в
 *       CompletionContext. CM6 сам вызывает source'ы после trigger-chars, мы дополнительно
 *       обрабатываем case когда user только что ввёл `(`/`,`/`=` (нам нужны values).
 *     — `Ctrl+Space` (explicit).
 *   • Маппит `SuggestResponse.completions` → `CompletionResult.options`:
 *     label = `Completion.label`, apply = `Completion.insert`, detail = `Completion.detail`,
 *     info = lazy-rendered HTML с icon+detail, type = kind'овое имя для CM6-стайлинга.
 *   • Debounce 150ms встроен на уровне фронта через `abortController` сабмита:
 *     CM6 сама дебаунсит source requests; мы просто обеспечиваем, что stale responses
 *     не рендерятся через signal-cancel.
 *   • TTL-кэш — в `suggest-cache.ts`.
 *
 * Инварианты:
 *   • Never throws. 500/network errors → `null` (CM6 интерпретирует как "нет подсказок").
 *   • `from` = конец последнего non-word-char перед cursor (дефолтный CM6 matchBefore).
 *   • Empty response → `null`, чтобы CM6 скрыл popup.
 */

import type { Completion as CmCompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Completion as TtqlCompletion } from '../../api/search';
import { cachedSuggest } from './suggest-cache';

function kindToCmType(kind: TtqlCompletion['kind']): string {
  switch (kind) {
    case 'field': return 'variable';
    case 'operator': return 'operator';
    case 'function': return 'function';
    case 'value': return 'constant';
    case 'keyword': return 'keyword';
  }
}

function renderInfo(item: TtqlCompletion): Node | null {
  if (!item.detail && !item.icon) return null;
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;font-size:12px;';
  if (item.icon) {
    // icon can be an emoji / color-hex / short identifier — render as plain text marker.
    // Full avatar / color-dot SVG rendering будет в PR-12/PR-13 (Basic-popover path),
    // здесь минимальный визуал для inline dropdown в редакторе.
    const i = document.createElement('span');
    i.textContent = item.icon;
    i.style.cssText = 'flex-shrink:0;min-width:16px;';
    root.appendChild(i);
  }
  if (item.detail) {
    const d = document.createElement('span');
    d.textContent = item.detail;
    d.style.cssText = 'color:#8b949e;';
    root.appendChild(d);
  }
  return root;
}

function toCmCompletion(item: TtqlCompletion): CmCompletion {
  return {
    label: item.label,
    apply: item.insert,
    detail: item.detail,
    type: kindToCmType(item.kind),
    // CM6 sorts by `boost` descending — map backend score (0..1) to range [-99,99].
    boost: Math.round((item.score - 0.5) * 198),
    info: () => renderInfo(item),
  };
}

/**
 * Word-boundary regex matching TTS-QL tokens. Allows dotted paths, cf-prefix and digits.
 * CM6 uses this for `from`/`to` calculation — the text from `from..pos` is what the user
 * has already typed and we overwrite with the chosen completion.
 */
const IDENT_RE = /[\w."-]*/;

export function ttqlCompletionSource(triggerChars: Set<string>) {
  return async function source(context: CompletionContext): Promise<CompletionResult | null> {
    // Find the word at cursor.
    const word = context.matchBefore(IDENT_RE);
    // If user has typed no word and is not explicitly triggering, bail — prevents
    // unnecessary fetch on every cursor move / arrow-key.
    if (!word && !context.explicit) return null;

    // Trigger after specific characters — when the current typed text is empty but
    // the char immediately before the cursor is in trigger set, still fetch.
    if (!context.explicit && word && word.from === word.to) {
      const before = context.state.doc.sliceString(Math.max(0, context.pos - 1), context.pos);
      if (!triggerChars.has(before)) return null;
    }

    const jql = context.state.doc.toString();
    try {
      const result = await cachedSuggest({
        jql,
        cursor: context.pos,
        prefix: word?.text?.replace(/^"/, '').replace(/"$/, '') || undefined,
      });
      if (context.aborted) return null;
      if (result.completions.length === 0) return null;
      return {
        from: word?.from ?? context.pos,
        options: result.completions.map(toCmCompletion),
        validFor: IDENT_RE,
      };
    } catch {
      return null;
    }
  };
}

export const DEFAULT_TRIGGER_CHARS = new Set<string>(['=', ',', '(', ' ']);
