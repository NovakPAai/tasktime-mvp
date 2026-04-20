/**
 * TTSRH-1 PR-3 — function registry for TTS-QL.
 *
 * Two responsibilities:
 *   1. Signature table consumed by the validator (arity, arg types, return type,
 *      phase). Ambiguous or Phase-2 functions are gated here and surfaced via
 *      stable error codes.
 *   2. Pure evaluators for date/time helpers (`now`, `today`, `startOf*`, etc.).
 *      These run at validate/compile time without hitting the DB and are
 *      deterministic given a fixed `now`. DB-dependent functions (`currentUser`,
 *      `openSprints`, …) are registered but return `null` here — compiler
 *      (PR-4/6) wires their resolution.
 *
 * Offset syntax (§5.4 ТЗ): `startOfDay("-7d")`, `endOfMonth("1M")`. Units `d`/`w`/
 * `M`/`y`/`h`/`m`. An empty/missing offset = 0.
 */

import type { QueryVariant, TtqlReturnType, FunctionPhase, TtqlType } from './search.types.js';

// ─── Signature ──────────────────────────────────────────────────────────────

export interface FunctionArg {
  name: string;
  type: TtqlType | 'OFFSET' | 'ISSUE_KEY' | 'ANY';
  optional: boolean;
}

export interface FunctionDef {
  name: string;
  args: readonly FunctionArg[];
  returnType: TtqlReturnType;
  phase: FunctionPhase;
  /** `'default'` = user search, `'checkpoint'` = KT condition evaluator (§5.12.4). */
  availableIn: readonly QueryVariant[];
  description: string;
}

/**
 * MVP function table — see §5.4 ТЗ. Names are stored lowercase; validator compares
 * case-insensitively. Phase-2 functions are included so the parser can still accept
 * them; validator emits `PHASE_2_FUNCTION` error with a hint.
 */
export const FUNCTION_REGISTRY: readonly FunctionDef[] = [
  // Identity / user
  // `currentUser()` is callable in both variants but resolves to NULL in `checkpoint`;
  // the validator emits a CURRENTUSER_IN_CHECKPOINT warning there per §5.12.4 ТЗ.
  { name: 'currentuser', args: [], returnType: { kind: 'scalar', type: 'USER' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Текущий пользователь. В контексте КТ резолвится в NULL (R19) — выдаётся warning.' },
  { name: 'membersof', args: [{ name: 'group', type: 'GROUP', optional: false }], returnType: { kind: 'list', type: 'USER' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Члены указанной группы.' },
  // Time — pure
  { name: 'now', args: [], returnType: { kind: 'scalar', type: 'DATETIME' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Текущий момент (в часовом поясе сервера).' },
  { name: 'today', args: [], returnType: { kind: 'scalar', type: 'DATE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Сегодня на 00:00 (в часовом поясе сервера).' },
  ...buildStartEndVariants('day', 'DATETIME'),
  ...buildStartEndVariants('week', 'DATETIME'),
  ...buildStartEndVariants('month', 'DATETIME'),
  ...buildStartEndVariants('year', 'DATETIME'),
  // Sprints
  { name: 'opensprints', args: [], returnType: { kind: 'list', type: 'SPRINT' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Активные спринты доступных пользователю проектов.' },
  { name: 'closedsprints', args: [], returnType: { kind: 'list', type: 'SPRINT' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Завершённые спринты.' },
  { name: 'futuresprints', args: [], returnType: { kind: 'list', type: 'SPRINT' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Запланированные спринты.' },
  // Releases
  { name: 'unreleasedversions', args: [{ name: 'project', type: 'PROJECT', optional: true }], returnType: { kind: 'list', type: 'RELEASE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Все ещё не выпущенные релизы.' },
  { name: 'releasedversions', args: [{ name: 'project', type: 'PROJECT', optional: true }], returnType: { kind: 'list', type: 'RELEASE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Выпущенные релизы.' },
  { name: 'earliestunreleasedversion', args: [{ name: 'project', type: 'PROJECT', optional: true }], returnType: { kind: 'scalar', type: 'RELEASE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Ближайший unreleased релиз.' },
  { name: 'latestreleasedversion', args: [{ name: 'project', type: 'PROJECT', optional: true }], returnType: { kind: 'scalar', type: 'RELEASE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Последний released релиз.' },
  // Issue relations
  { name: 'linkedissues', args: [{ name: 'key', type: 'ISSUE_KEY', optional: false }, { name: 'linkType', type: 'TEXT', optional: true }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Задачи, связанные с указанной.' },
  { name: 'subtasksof', args: [{ name: 'key', type: 'ISSUE_KEY', optional: false }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Дочерние задачи (подзадачи).' },
  { name: 'epicissues', args: [{ name: 'key', type: 'ISSUE_KEY', optional: false }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Задачи, входящие в эпик.' },
  { name: 'myopenissues', args: [], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default'], description: 'Shortcut: assignee = currentUser() AND statusCategory != DONE.' },
  // Checkpoint-scoped functions (§5.4 extensions, TTSRH-37). Wire-up in PR-17.
  { name: 'violatedcheckpoints', args: [{ name: 'typeName', type: 'TEXT', optional: true }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Задачи с активными нарушениями КТ.' },
  { name: 'violatedcheckpointsof', args: [{ name: 'releaseKeyOrId', type: 'RELEASE', optional: false }, { name: 'typeName', type: 'TEXT', optional: true }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Нарушения КТ в конкретном релизе.' },
  { name: 'checkpointsatrisk', args: [{ name: 'typeName', type: 'TEXT', optional: true }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Задачи релизов с КТ в состоянии WARNING/OVERDUE/ERROR.' },
  { name: 'checkpointsinstate', args: [{ name: 'state', type: 'CHECKPOINT_STATE', optional: false }, { name: 'typeName', type: 'TEXT', optional: true }], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'MVP', availableIn: ['default', 'checkpoint'], description: 'Задачи, где КТ находится в заданном состоянии.' },
  // Checkpoint-context-only (§5.12.4) — wiring in PR-15
  { name: 'releaseplanneddate', args: [], returnType: { kind: 'scalar', type: 'DATETIME' }, phase: 'MVP', availableIn: ['checkpoint'], description: 'Дата плановой сдачи релиза (только для КТ-условий).' },
  { name: 'checkpointdeadline', args: [], returnType: { kind: 'scalar', type: 'DATETIME' }, phase: 'MVP', availableIn: ['checkpoint'], description: 'Дедлайн КТ = releasePlannedDate + offsetDays (только для КТ-условий).' },
  // Phase 2 — parser accepts, validator rejects
  { name: 'watchedissues', args: [], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'PHASE_2', availableIn: ['default'], description: 'Задачи, на которые я подписан (Phase 2).' },
  { name: 'votedissues', args: [], returnType: { kind: 'list', type: 'ISSUE' }, phase: 'PHASE_2', availableIn: ['default'], description: 'Голоса (Phase 2).' },
  { name: 'lastlogin', args: [], returnType: { kind: 'scalar', type: 'DATETIME' }, phase: 'PHASE_2', availableIn: ['default'], description: 'Время последнего входа (Phase 2).' },
];

function buildStartEndVariants(unit: 'day' | 'week' | 'month' | 'year', rt: TtqlType): FunctionDef[] {
  const cap = unit[0]!.toUpperCase() + unit.slice(1);
  return [
    {
      name: `startof${unit}`,
      args: [{ name: 'offset', type: 'OFFSET', optional: true }],
      returnType: { kind: 'scalar', type: rt },
      phase: 'MVP',
      availableIn: ['default', 'checkpoint'],
      description: `Начало ${cap} с необязательным смещением, напр. startOf${cap}("-1${unit === 'month' ? 'M' : unit[0]}").`,
    },
    {
      name: `endof${unit}`,
      args: [{ name: 'offset', type: 'OFFSET', optional: true }],
      returnType: { kind: 'scalar', type: rt },
      phase: 'MVP',
      availableIn: ['default', 'checkpoint'],
      description: `Конец ${cap} с необязательным смещением.`,
    },
  ];
}

const FUNCTION_INDEX: Map<string, FunctionDef> = (() => {
  const map = new Map<string, FunctionDef>();
  for (const f of FUNCTION_REGISTRY) map.set(f.name, f);
  return map;
})();

export function resolveFunction(name: string): FunctionDef | null {
  return FUNCTION_INDEX.get(name.toLowerCase()) ?? null;
}

// ─── Pure evaluators for date/time ──────────────────────────────────────────

export interface EvaluatorContext {
  /** Anchor time. Caller supplies; scheduler passes `evaluatedAt` for KT variant. */
  now: Date;
}

/**
 * Parse a relative-offset string (`"-7d"`, `"1M"`, `"3h"`) into milliseconds. Months
 * and years are approximated via calendar arithmetic on the anchor date — caller
 * passes the anchor and the unit to `applyOffset` to get exact results.
 */
export function parseOffset(offset: string): { amount: number; unit: 'd' | 'w' | 'M' | 'y' | 'h' | 'm' } | null {
  const m = /^(-?\d+)([dwMyhm])$/.exec(offset);
  if (!m) return null;
  return { amount: Number.parseInt(m[1]!, 10), unit: m[2] as 'd' | 'w' | 'M' | 'y' | 'h' | 'm' };
}

/**
 * Add a parsed offset to an anchor date. Returns a new Date. `M` and `y` use
 * calendar-aware arithmetic (`setUTCMonth`, `setUTCFullYear`) so "end of next month
 * from March 30" is correctly May 1st, not "March 30 + 31 days".
 */
export function applyOffset(anchor: Date, offset: { amount: number; unit: 'd' | 'w' | 'M' | 'y' | 'h' | 'm' }): Date {
  const d = new Date(anchor.getTime());
  switch (offset.unit) {
    case 'h': d.setUTCHours(d.getUTCHours() + offset.amount); break;
    case 'm': d.setUTCMinutes(d.getUTCMinutes() + offset.amount); break;
    case 'd': d.setUTCDate(d.getUTCDate() + offset.amount); break;
    case 'w': d.setUTCDate(d.getUTCDate() + offset.amount * 7); break;
    case 'M': d.setUTCMonth(d.getUTCMonth() + offset.amount); break;
    case 'y': d.setUTCFullYear(d.getUTCFullYear() + offset.amount); break;
  }
  return d;
}

/** Return midnight of the given date (UTC). */
export function startOfDayUtc(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Return 23:59:59.999 of the given date (UTC). */
export function endOfDayUtc(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

/**
 * ISO-week start (Monday 00:00 UTC). Matches Jira convention (and is what §5.4 ТЗ
 * calls out for `startOfWeek([offset])`).
 */
export function startOfIsoWeekUtc(d: Date): Date {
  const x = startOfDayUtc(d);
  const dow = x.getUTCDay(); // 0 = Sun … 6 = Sat
  const mondayShift = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + mondayShift);
  return x;
}

export function endOfIsoWeekUtc(d: Date): Date {
  const mon = startOfIsoWeekUtc(d);
  const sun = new Date(mon.getTime());
  sun.setUTCDate(sun.getUTCDate() + 6);
  sun.setUTCHours(23, 59, 59, 999);
  return sun;
}

export function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function endOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function startOfYearUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

export function endOfYearUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

/**
 * Evaluate a date-only function with optional offset. Returns `null` if the
 * function isn't one of the pure date helpers. Caller (compiler) should use a
 * different path for DB-dependent functions. `offset` is pre-parsed; pass `null`
 * when omitted.
 */
export function evaluatePureDateFn(
  name: string,
  offset: { amount: number; unit: 'd' | 'w' | 'M' | 'y' | 'h' | 'm' } | null,
  ctx: EvaluatorContext,
): Date | null {
  const lower = name.toLowerCase();
  const shifted = offset ? applyOffset(ctx.now, offset) : ctx.now;
  switch (lower) {
    case 'now': return shifted;
    case 'today': return startOfDayUtc(shifted);
    case 'startofday': return startOfDayUtc(shifted);
    case 'endofday': return endOfDayUtc(shifted);
    case 'startofweek': return startOfIsoWeekUtc(shifted);
    case 'endofweek': return endOfIsoWeekUtc(shifted);
    case 'startofmonth': return startOfMonthUtc(shifted);
    case 'endofmonth': return endOfMonthUtc(shifted);
    case 'startofyear': return startOfYearUtc(shifted);
    case 'endofyear': return endOfYearUtc(shifted);
    default: return null;
  }
}

/**
 * Iterate the registry filtered by variant. Used by the `/search/schema` endpoint
 * to expose only the functions legal in the caller's context. **Phase-2 functions
 * are excluded** — they'd only confuse autocomplete (user would pick one and then
 * hit PHASE_2_FUNCTION at validate-time).
 */
export function functionsForVariant(variant: QueryVariant): FunctionDef[] {
  return FUNCTION_REGISTRY.filter(
    (f) => f.phase === 'MVP' && f.availableIn.includes(variant),
  );
}
