/**
 * TTSRH-1 PR-12 — модель данных для BasicFilterBuilder.
 *
 * Публичный API:
 *   • BasicChip — плоская структура одного фильтра (field/op/values).
 *   • canBasicize(jql) — проверить, можно ли представить JQL в Basic-режиме.
 *   • chipsFromJql(jql) — распарсить JQL в массив chips (если возможно).
 *   • jqlFromChips(chips) — сериализовать chips обратно в canonical JQL.
 *   • CATEGORIES — группы полей для cascade-меню (§5.7 ТЗ).
 *
 * Инварианты:
 *   • Basic ограничен flat AND-цепочкой clauses с операторами =, !=, IN, NOT IN.
 *   • OR / NOT / группировка / функции / history-operators (WAS/CHANGED) → Basic
 *     недоступен (R9). Caller получает `{ok:false, reason}` и показывает tooltip.
 *   • Сериализация детерминирована (stable key order): поля сортируются по
 *     порядку появления, values внутри chip — по строковому порядку. Это важно
 *     для URL sync и snapshot-тестов (T-10).
 *   • Сериализация strings: если значение содержит `"`, `\`, `,` или не
 *     совпадает с `^[A-Za-z_][A-Za-z0-9_]*$`, оборачиваем в кавычки с escape'ом.
 */

// ─── Categories (§5.7) ──────────────────────────────────────────────────────

export interface FieldCategory {
  key: string;
  label: string;
  fields: string[];
}

// Order matters — определяет order of appearance в cascade menu.
export const CATEGORIES: FieldCategory[] = [
  {
    key: 'task',
    label: 'Задача',
    fields: ['project', 'key', 'summary', 'type', 'status', 'priority', 'description', 'labels'],
  },
  {
    key: 'dates',
    label: 'Даты',
    fields: ['due', 'created', 'updated', 'resolvedAt'],
  },
  {
    key: 'people',
    label: 'Пользователи',
    fields: ['assignee', 'reporter', 'creator'],
  },
  {
    key: 'planning',
    label: 'Планирование',
    fields: ['sprint', 'release', 'parent', 'epic', 'estimatedHours'],
  },
  {
    key: 'ai',
    label: 'AI',
    fields: ['aiEligible', 'aiStatus', 'aiAssigneeType'],
  },
];

// ─── Chip model ─────────────────────────────────────────────────────────────

export type BasicOp = '=' | '!=' | 'IN' | 'NOT IN';

export interface BasicChip {
  id: string;
  field: string;
  op: BasicOp;
  /** For = / !=, exactly 1 value; for IN / NOT IN, ≥ 1 value. */
  values: string[];
}

export interface CanBasicizeResult {
  ok: boolean;
  reason?: string;
}

// ─── JQL → chips ────────────────────────────────────────────────────────────

const ADVANCED_RE = /\b(OR|NOT|WAS|CHANGED|~|!~|ORDER BY)\b/i;
// Match `field op value` or `field IN (v1, v2)`. Greedy but limited: values can be
// bare identifiers, numbers, or quoted strings.
const CLAUSE_RE =
  /([A-Za-z_][A-Za-z0-9_]*)\s*(!=|=|IN|NOT\s+IN)\s*(\([^)]*\)|"(?:[^"\\]|\\.)*"|[A-Za-z0-9_+\-.]+)/gi;

function unquote(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return trimmed;
}

export function canBasicize(jql: string): CanBasicizeResult {
  const q = jql.trim();
  if (q.length === 0) return { ok: true };
  if (ADVANCED_RE.test(q)) {
    return { ok: false, reason: 'Запрос содержит OR / NOT / WAS / CHANGED / ~ или ORDER BY — недоступно в Basic.' };
  }
  // Strip `IN (...)` / `NOT IN (...)` groups (valid in Basic), then any residual
  // `(` means explicit grouping — disallowed. Without this strip, a query like
  // `type IN (Bug) AND (status = Done)` would pass the old short-circuit and
  // `chipsFromJql` would silently drop the grouped clause.
  const stripped = q
    .replace(/\bNOT\s+IN\s*\([^)]*\)/gi, '')
    .replace(/\bIN\s*\([^)]*\)/gi, '');
  if (stripped.includes('(')) {
    return { ok: false, reason: 'Запрос содержит группировку в скобках или вызов функции — недоступно в Basic.' };
  }
  return { ok: true };
}

export function chipsFromJql(jql: string): { chips: BasicChip[]; ok: boolean; reason?: string } {
  const check = canBasicize(jql);
  if (!check.ok) return { chips: [], ok: false, reason: check.reason };
  const chips: BasicChip[] = [];
  let counter = 0;
  // Strip surrounding whitespace and split by AND (case-insensitive).
  CLAUSE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLAUSE_RE.exec(jql)) !== null) {
    const [, field, rawOp, rhs] = match;
    const op = rawOp.toUpperCase().replace(/\s+/g, ' ') as BasicOp;
    let values: string[];
    if (rhs.startsWith('(')) {
      // `(v1, v2, "v 3")` — split on commas not inside quotes.
      values = splitInList(rhs.slice(1, -1));
    } else {
      values = [unquote(rhs)];
    }
    chips.push({
      id: `c${counter++}`,
      field,
      op: (op === 'IN' || op === 'NOT IN' || op === '!=' || op === '=') ? op : '=',
      values: values.map((v) => v.trim()).filter((v) => v.length > 0),
    });
  }
  return { chips, ok: true };
}

function splitInList(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  let escaped = false;
  for (const ch of inner) {
    if (escaped) { cur += ch; escaped = false; continue; }
    if (ch === '\\' && inQuotes) { cur += ch; escaped = true; continue; }
    if (ch === '"') { cur += ch; inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { out.push(unquote(cur)); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim().length > 0) out.push(unquote(cur));
  return out;
}

// ─── Chips → JQL ────────────────────────────────────────────────────────────

const BARE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function serializeValue(v: string): string {
  if (BARE_IDENT_RE.test(v) || /^-?\d+(\.\d+)?$/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function jqlFromChips(chips: BasicChip[]): string {
  return chips
    .map((c) => ({ ...c, values: c.values.filter((v) => v.trim().length > 0) }))
    .filter((c) => c.field && c.values.length > 0)
    .map((c) => {
      if (c.op === 'IN' || c.op === 'NOT IN') {
        const list = c.values.map(serializeValue).join(', ');
        return `${c.field} ${c.op} (${list})`;
      }
      return `${c.field} ${c.op} ${serializeValue(c.values[0]!)}`;
    })
    .join(' AND ');
}
