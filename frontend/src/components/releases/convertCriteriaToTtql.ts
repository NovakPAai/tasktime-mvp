/**
 * TTSRH-1 PR-19 — one-way конвертер `CheckpointCriterion[] → canonical TTS-QL`.
 *
 * Не автоматический: результат вставляется в TTQL-редактор для ручного ревью
 * админом (§R21, TTSRH-36). Покрывает все 6 типов criterion из §5.12.9 ТЗ.
 *
 * Инварианты:
 *   • Конкатенация через ` AND ` — structured-семантика.
 *   • `issueTypes` фильтр преобразуется в префикс-clause `type IN (…)`
 *     перед основным условием.
 *   • `CUSTOM_FIELD_VALUE` → `cf["<id>"] op value`. Для `IN` — список
 *     значений в скобках; для `NOT_EMPTY` — `IS NOT EMPTY`; для `EQUALS` —
 *     `=` с quoted-string если значение не-identifier.
 *   • `DUE_BEFORE` → `dueDate < releasePlannedDate("<days>d")` —
 *     функция wire-up'ится в PR-17 follow-up; до того evaluation упадёт в
 *     state=ERROR с явным reason (loud fail, not silent NULL).
 *   • `ALL_SUBTASKS_DONE` → `hasChildren = false OR subtasksOf(key) IN (…)`
 *     сложно выразить без recursion — emit'им placeholder-коммент что
 *     требуется ручное ревью (TTSRH-36 явно говорит "ручная проверка перед save").
 *   • `NO_BLOCKING_LINKS` → `linkedIssue NOT IN (…)` — аналогично placeholder.
 *
 * Never throws — неподдерживаемые типы emit'ят TODO-комментарий.
 */

import type { CheckpointCriterion } from '../../api/release-checkpoint-types';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quote(v: string): string {
  if (IDENT_RE.test(v) || /^-?\d+(\.\d+)?$/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function typesPrefix(issueTypes?: string[]): string | null {
  if (!issueTypes || issueTypes.length === 0) return null;
  if (issueTypes.length === 1) return `type = ${quote(issueTypes[0]!)}`;
  return `type IN (${issueTypes.map(quote).join(', ')})`;
}

function convertOne(c: CheckpointCriterion): string {
  const prefix = typesPrefix(c.issueTypes);
  const wrap = (body: string) => (prefix ? `(${prefix}) AND (${body})` : body);

  switch (c.type) {
    case 'STATUS_IN': {
      // statusCategory is the TTS-QL field for StatusCategory enum.
      const vals = c.categories.map(quote).join(', ');
      return wrap(c.categories.length === 1 ? `statusCategory = ${vals}` : `statusCategory IN (${vals})`);
    }
    case 'DUE_BEFORE': {
      // checkpointDeadline() wire-up ожидается в follow-up резолвере. До того
      // engine эмитит state=ERROR с явным reason — не silent NULL.
      const days = c.days;
      const sign = days >= 0 ? '+' : '-';
      return wrap(`due < checkpointDeadline() ${sign} ${Math.abs(days)}d`);
    }
    case 'ASSIGNEE_SET':
      return wrap('assignee IS NOT EMPTY');
    case 'CUSTOM_FIELD_VALUE': {
      const field = `cf["${c.customFieldId}"]`;
      if (c.operator === 'NOT_EMPTY') return wrap(`${field} IS NOT EMPTY`);
      if (c.operator === 'EQUALS') {
        const v = c.value === undefined || c.value === null ? '""' : quote(String(c.value));
        return wrap(`${field} = ${v}`);
      }
      if (c.operator === 'IN') {
        const arr = Array.isArray(c.value) ? (c.value as unknown[]) : [];
        const vals = arr.map((x) => quote(String(x))).join(', ');
        return wrap(`${field} IN (${vals})`);
      }
      return wrap(`-- TODO ${c.operator} not directly expressible — manual review required`);
    }
    case 'ALL_SUBTASKS_DONE':
      // Нет прямого выражения для «все subtasks в DONE» без функции reducer.
      // Emit placeholder — админ дошлифует вручную.
      return wrap(`-- TODO ALL_SUBTASKS_DONE requires custom TTS-QL (e.g. subtasksOf(key) statusCategory IN (DONE))`);
    case 'NO_BLOCKING_LINKS': {
      const types = c.linkTypeKeys && c.linkTypeKeys.length > 0
        ? c.linkTypeKeys.map(quote).join(', ')
        : '"blocks"';
      return wrap(`-- TODO NO_BLOCKING_LINKS: нужен custom predicate; links of type (${types}) IS EMPTY`);
    }
    default: {
      const exhaust: never = c;
      return `-- unsupported criterion: ${JSON.stringify(exhaust)}`;
    }
  }
}

/**
 * Преобразует AND-combined `criteria[]` в one-line canonical TTS-QL.
 * Пустой список → пустая строка.
 */
export function convertCriteriaToTtql(criteria: CheckpointCriterion[]): string {
  if (criteria.length === 0) return '';
  const parts = criteria.map(convertOne);
  // Если ровно один элемент без `(…)` обёртки — возвращаем без скобок.
  if (parts.length === 1) return parts[0]!;
  return parts.join(' AND ');
}
