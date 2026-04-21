/**
 * TTSRH-1 PR-10 — CodeMirror 6 StreamLanguage adapter for TTS-QL.
 *
 * Цель: подсветка keywords / strings / numbers / functions / identifiers в редакторе
 * без полной реимплементации парсера на frontend. Backend parser — authoritative,
 * этот модуль — чисто косметический ближе к lexer-only классификатору.
 *
 * Инварианты:
 *   • Keywords зеркалят backend search.tokenizer.ts — AND/OR/NOT/IN/IS/EMPTY/NULL/
 *     ORDER/BY/ASC/DESC/TRUE/FALSE + history-keywords WAS/CHANGED/FROM/TO/AFTER/
 *     BEFORE/ON/DURING (хоть парсер их ещё rejects — визуально ок).
 *   • Case-insensitive матчинг, идентично tokenizer'у.
 *   • Функции опознаём как Ident сопровождаемый `(` — в StreamLanguage нет lookahead,
 *     поэтому смотрим следующий символ через `stream.peek`.
 *   • RelativeDate (`-7d`, `+1w`) подсвечивается как number.
 *   • Кастомное поле `cf["name"]` — специальный шаблон с префиксом `cf[`.
 *   • Fail-open: если не удалось классифицировать — возвращаем null (дефолтный цвет).
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { LanguageSupport } from '@codemirror/language';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';

const KEYWORDS = new Set([
  'AND', 'OR', 'NOT',
  'IN',
  'IS', 'EMPTY', 'NULL',
  'ORDER', 'BY', 'ASC', 'DESC',
  'TRUE', 'FALSE',
  // History (Phase 2 — visually highlighted but parser rejects).
  'WAS', 'CHANGED', 'FROM', 'TO', 'AFTER', 'BEFORE', 'ON', 'DURING',
]);

interface State {
  // track whether we just emitted an Ident that's actually a function name (followed by `(`).
  lastWasIdent: boolean;
}

const parser: StreamParser<State> = {
  startState: () => ({ lastWasIdent: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;

    // Comment: `-- ...` to end of line.
    if (stream.match('--')) {
      stream.skipToEnd();
      return 'comment';
    }

    // String: double-quoted with backslash escapes.
    const ch = stream.peek();
    if (ch === '"') {
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const c = stream.next()!;
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') break;
      }
      state.lastWasIdent = false;
      return 'string';
    }

    // Relative date: -7d, +1w, -1M, etc. Must be an Ident-preceded value (after op),
    // but StreamLanguage has no semantic context; accepting as number is visually fine.
    if (stream.match(/^[+-]\d+(?:\.\d+)?[dwMyhm]\b/)) {
      state.lastWasIdent = false;
      return 'number';
    }

    // Number: integer or decimal.
    if (stream.match(/^\d+(?:\.\d+)?/)) {
      state.lastWasIdent = false;
      return 'number';
    }

    // Custom field reference: cf["name"] — highlight `cf` as attribute-ish.
    if (stream.match(/^cf\[/i)) {
      state.lastWasIdent = false;
      return 'typeName';
    }

    // Operators.
    if (stream.match(/^(?:!=|<=|>=|!~|=|<|>|~)/)) {
      state.lastWasIdent = false;
      return 'operator';
    }
    if (ch === '(' || ch === ')' || ch === ',' || ch === ']') {
      stream.next();
      state.lastWasIdent = false;
      return 'punctuation';
    }

    // Identifier: [A-Za-z_][A-Za-z0-9_]*
    if (/[A-Za-z_]/.test(ch ?? '')) {
      stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      const word = stream.current();
      if (KEYWORDS.has(word.toUpperCase())) {
        state.lastWasIdent = false;
        return 'keyword';
      }
      // Function call? Peek next non-space for `(`.
      state.lastWasIdent = true;
      let saved = stream.pos;
      while (stream.peek() === ' ') { stream.next(); saved++; }
      if (stream.peek() === '(') {
        stream.pos = saved;
        return 'function';
      }
      stream.pos = saved;
      return 'variableName';
    }

    // Unknown — consume one char to avoid infinite loop.
    stream.next();
    state.lastWasIdent = false;
    return null;
  },
  languageData: {
    commentTokens: { line: '--' },
    // Closing bracket auto-matching relies on these.
    closeBrackets: { brackets: ['(', '['] },
  },
};

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c678dd', fontWeight: '500' },
  { tag: t.string, color: '#98c379' },
  { tag: t.number, color: '#d19a66' },
  { tag: t.function(t.variableName), color: '#61afef', fontStyle: 'italic' },
  { tag: t.variableName, color: '#e5c07b' },
  { tag: t.typeName, color: '#56b6c2' },
  { tag: t.operator, color: '#abb2bf' },
  { tag: t.punctuation, color: '#abb2bf' },
  { tag: t.comment, color: '#7f848e', fontStyle: 'italic' },
]);

export function ttqlLanguage(): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(parser), [syntaxHighlighting(highlight)]);
}
