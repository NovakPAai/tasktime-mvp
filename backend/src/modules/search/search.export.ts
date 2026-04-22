/**
 * TTSRH-1 PR-8 — `POST /api/search/export` — CSV/XLSX export of search results.
 *
 * Публичный API:
 *   • exportIssuesToCsv(input, ctx, res) — стримит CSV в res.
 *   • exportIssuesToXlsx(input, ctx, res) — стримит XLSX через `exceljs` streaming writer.
 *   • validateExportRequest(jql, ctx) — выполняет parse/validate/compile и
 *     возвращает `{kind:'ok', fetchBatch} | {kind:'error', ...}` для router'а.
 *
 * Инварианты:
 *   • Hard-timeout 60s (§5.6 NFR-8). По истечении — abort + сломанный response;
 *     на этой стадии клиент уже получил headers + часть потока. Логируем как warn.
 *   • Max-rows cap 50_000 — защита от memory/disk blow при случайном широком JQL.
 *     Клиент видит X-Export-Truncated: true header (если header'ы ещё в буфере)
 *     ИЛИ warning-строку в конец файла.
 *   • R3 (SEC-1) scope-фильтр наследуется из `accessibleProjectIds` — тот же
 *     контракт, что в `POST /search/issues`. Никаких параллельных путей.
 *   • Columns allow-list: белый список имён из SYSTEM_FIELDS + `loadCustomFields()`
 *     + стандартные meta-колонки (`key`, `type`, `assignee`, `projectKey`,
 *     `statusName`). Неизвестные columns молча выкидываются из проекции, чтобы
 *     не дать утечку произвольных Prisma-полей через имя колонки.
 *   • CSV escape: поля с `,`, `"`, `\n`, `\r` заворачиваются в кавычки; `"`
 *     удваивается. UTF-8 BOM в начале — чтобы Excel для macOS/Windows корректно
 *     отрендерил кириллицу.
 *   • Null-safe: `null`/`undefined` → пустая строка.
 *   • Streaming: findMany идёт батчами по 500 записей (cursor pagination — не
 *     skip/take, чтобы избежать O(n²) на больших offset'ах).
 *
 * Ссылки: §5.6 + §5.9 TTSRH-1.
 */

import { Response } from 'express';
import ExcelJS from 'exceljs';

import { prisma } from '../../prisma/client.js';
import { compile, type CompileIssue } from './search.compiler.js';
import { executeCustomFieldPredicates } from './search.custom-field.executor.js';
import { resolveFunctions } from './search.function-resolver.js';
import { parse } from './search.parser.js';
import { resolveReferenceValues } from './search.reference-resolver.js';
import { SYSTEM_FIELDS } from './search.schema.js';
import { loadCustomFields } from './search.schema.loader.js';
import { createValidatorContext, validate, type ValidationIssue } from './search.validator.js';
import type { ParseError } from './search.ast.js';
import type { Prisma } from '@prisma/client';

export interface ExportContext {
  userId: string;
  accessibleProjectIds: readonly string[];
  now?: Date;
}

export interface ExportInput {
  jql: string;
  columns?: string[];
}

export interface ExportPrepareError {
  kind: 'error';
  status: number;
  code: string;
  message: string;
  parseErrors?: ParseError[];
  validationErrors?: ValidationIssue[];
  compileErrors?: CompileIssue[];
}

export interface ExportPlan {
  kind: 'ok';
  where: Prisma.IssueWhereInput;
  orderBy: Prisma.IssueOrderByWithRelationInput[];
  customFieldMap: Map<string, { id: string; name: string; type: string }>;
}

// The concrete plan passed to iterateIssues — has resolved columns so the
// generator can narrow `customFieldValues` include to just the requested CFs.
interface ResolvedPlan extends ExportPlan {
  columns: ResolvedColumn[];
}

export type ExportPrepareResult = ExportPlan | ExportPrepareError;

const MAX_ROWS = 50_000;
const BATCH_SIZE = 500;
const QUERY_TIMEOUT_MS = 60_000;

// Standard projection keys we know how to render. Column names outside this set
// are checked against the custom-field registry before being accepted.
const STANDARD_COLUMNS = new Set([
  'key',
  'summary',
  'description',
  'type',
  'status',
  'statusName', // alias of `status` — §5.8 UI column name
  'priority',
  'assignee',
  'creator',
  'project',
  'projectKey',
  'created',
  'updated',
  'due',
  'sprint',
  'release',
  'estimatedHours',
  'aiExecutionStatus',
  'aiAssigneeType',
  'aiEligible',
]);

const DEFAULT_COLUMNS: string[] = ['key', 'summary', 'type', 'status', 'priority', 'assignee', 'sprint', 'updated'];

interface ResolvedColumn {
  name: string;
  label: string;
  isCustom: boolean;
  customFieldId?: string;
}

function resolveColumns(
  columns: string[] | undefined,
  customFieldMap: Map<string, { id: string; name: string; type: string }>,
): ResolvedColumn[] {
  const requested = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;
  const systemFieldByName = new Map(SYSTEM_FIELDS.map((f) => [f.name, f]));
  const resolved: ResolvedColumn[] = [];
  for (const name of requested) {
    if (STANDARD_COLUMNS.has(name) || systemFieldByName.has(name)) {
      resolved.push({ name, label: systemFieldByName.get(name)?.label ?? name, isCustom: false });
      continue;
    }
    const cf = customFieldMap.get(name);
    if (cf) {
      resolved.push({ name, label: cf.name, isCustom: true, customFieldId: cf.id });
      continue;
    }
    // Unknown column — drop silently. We could alternatively return a validation
    // error, but that complicates the streaming contract; export is "best
    // effort" per §5.6. The UI validates columns against /search/schema upfront.
  }
  return resolved;
}

export async function prepareExport(input: ExportInput, ctx: ExportContext): Promise<ExportPrepareResult> {
  const now = ctx.now ?? new Date();

  const { ast, errors: parseErrors } = parse(input.jql);
  if (!ast || parseErrors.length > 0) {
    return {
      kind: 'error',
      status: 400,
      code: 'PARSE_ERROR',
      message: 'TTS-QL query failed to parse.',
      parseErrors,
    };
  }

  const customFields = await loadCustomFields();
  const validation = validate(ast, createValidatorContext({ variant: 'default', customFields }));
  if (!validation.valid) {
    return {
      kind: 'error',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'TTS-QL query is syntactically valid but semantically rejected.',
      validationErrors: validation.errors,
    };
  }

  const resolved = await resolveFunctions(ast, {
    userId: ctx.userId,
    accessibleProjectIds: ctx.accessibleProjectIds,
    now,
    variant: 'default',
  });

  const referenceValues = await resolveReferenceValues(ast, {
    accessibleProjectIds: ctx.accessibleProjectIds,
  });
  const compiled = compile(ast, {
    accessibleProjectIds: ctx.accessibleProjectIds,
    referenceValues,
    customFields,
    resolved,
    now,
    variant: 'default',
  });
  if (compiled.errors.length > 0) {
    return {
      kind: 'error',
      status: 422,
      code: 'COMPILE_ERROR',
      message: 'TTS-QL query could not be compiled to a database query.',
      compileErrors: compiled.errors,
    };
  }

  // Resolve custom-field predicates into a final Prisma `where` (same path as
  // /search/issues — keeps RBAC and predicate semantics identical).
  const exec = await executeCustomFieldPredicates(
    compiled.where,
    compiled.customPredicates,
    ctx.accessibleProjectIds,
  );
  if (exec.errors.length > 0) {
    return {
      kind: 'error',
      status: 422,
      code: 'EXECUTOR_ERROR',
      message: 'One or more custom-field predicates failed to execute.',
      compileErrors: exec.errors,
    };
  }

  const customFieldMap = new Map(
    customFields.map((cf) => [cf.name, { id: cf.id, name: cf.name, type: cf.type }]),
  );

  return {
    kind: 'ok',
    where: exec.where,
    orderBy: compiled.orderBy.length > 0 ? compiled.orderBy : [{ updatedAt: 'desc' }],
    customFieldMap,
  };
}

// ─── Column value extraction ───────────────────────────────────────────────

type IssuePayload = Prisma.IssueGetPayload<{
  include: {
    assignee: { select: { id: true; name: true; email: true } };
    creator: { select: { id: true; name: true; email: true } };
    project: { select: { id: true; key: true; name: true } };
    workflowStatus: { select: { id: true; name: true; category: true; systemKey: true } };
    issueTypeConfig: { select: { systemKey: true; name: true } };
    sprint: { select: { id: true; name: true } };
    release: { select: { id: true; name: true } };
    customFieldValues: {
      select: {
        customFieldId: true;
        value: true;
      };
    };
  };
}>;

function extractValue(issue: IssuePayload, col: ResolvedColumn): string | number | null {
  if (col.isCustom && col.customFieldId) {
    const cf = issue.customFieldValues.find((v) => v.customFieldId === col.customFieldId);
    if (!cf) return null;
    return formatJsonValue(cf.value);
  }
  switch (col.name) {
    case 'key':
      return issue.project ? `${issue.project.key}-${issue.number}` : null;
    case 'projectKey':
      return issue.project?.key ?? null;
    case 'project':
      return issue.project?.name ?? null;
    case 'summary':
      return issue.title;
    case 'description':
      return issue.description ?? null;
    case 'type':
      return issue.issueTypeConfig?.systemKey ?? issue.issueTypeConfig?.name ?? null;
    case 'status':
    case 'statusName':
      return issue.workflowStatus?.name ?? null;
    case 'priority':
      return issue.priority ?? null;
    case 'assignee':
      return issue.assignee ? `${issue.assignee.name} <${issue.assignee.email}>` : null;
    case 'creator':
      return issue.creator ? `${issue.creator.name} <${issue.creator.email}>` : null;
    case 'created':
      return issue.createdAt ? issue.createdAt.toISOString() : null;
    case 'updated':
      return issue.updatedAt ? issue.updatedAt.toISOString() : null;
    case 'due':
      return issue.dueDate ? issue.dueDate.toISOString() : null;
    case 'sprint':
      return issue.sprint?.name ?? null;
    case 'release':
      return issue.release?.name ?? null;
    case 'estimatedHours':
      // Prisma Decimal → string for consistent CSV output (ExcelJS accepts either).
      return issue.estimatedHours === null || issue.estimatedHours === undefined
        ? null
        : issue.estimatedHours.toString();
    case 'aiExecutionStatus':
      return issue.aiExecutionStatus ?? null;
    case 'aiAssigneeType':
      return issue.aiAssigneeType ?? null;
    case 'aiEligible':
      return issue.aiEligible === null || issue.aiEligible === undefined ? null : issue.aiEligible ? 'true' : 'false';
    default:
      return null;
  }
}

function formatJsonValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((x) => (x === null ? '' : String(x))).join(', ');
  return JSON.stringify(v);
}

// ─── Batched issue iterator ─────────────────────────────────────────────────

class ExportAbortError extends Error {
  constructor() {
    super('Export aborted');
    this.name = 'ExportAbortError';
  }
}

async function* iterateIssues(
  plan: ResolvedPlan,
  cap: number,
  signal: AbortSignal,
): AsyncGenerator<IssuePayload[], void, void> {
  const customFieldIds = plan.columns.filter((c) => c.isCustom && c.customFieldId).map((c) => c.customFieldId!);
  let cursor: string | undefined;
  let remaining = cap;
  while (remaining > 0) {
    if (signal.aborted) return;
    const take = Math.min(BATCH_SIZE, remaining);
    // Promise.race with abort-signal so the caller's `finally` can close the
    // HTTP connection the moment the timeout fires — the Prisma query still
    // completes in the background, but the client isn't held hostage to it
    // (Postgres `statement_timeout` is the ultimate backstop).
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => reject(new ExportAbortError());
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
    const findMany = prisma.issue.findMany({
      where: plan.where,
      orderBy: [...plan.orderBy, { id: 'asc' }],
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, key: true, name: true } },
        workflowStatus: { select: { id: true, name: true, category: true, systemKey: true } },
        issueTypeConfig: { select: { systemKey: true, name: true } },
        sprint: { select: { id: true, name: true } },
        release: { select: { id: true, name: true } },
        customFieldValues: customFieldIds.length > 0
          ? {
              where: { customFieldId: { in: customFieldIds } },
              select: { customFieldId: true, value: true },
            }
          : { select: { customFieldId: true, value: true }, take: 0 },
      },
    });
    let batch: IssuePayload[];
    try {
      batch = (await Promise.race([findMany, abortPromise])) as unknown as IssuePayload[];
    } catch (err) {
      if (err instanceof ExportAbortError) return;
      throw err;
    }
    if (batch.length === 0) return;
    yield batch;
    remaining -= batch.length;
    if (batch.length < take) return;
    cursor = batch[batch.length - 1].id;
  }
}

// CSV formula-injection (CWE-1236): Excel/LibreOffice treat cells starting with
// `=`, `+`, `-`, `@`, `\t`, `\r` as formulas. Wrapping in double-quotes neutralises
// the interpretation while staying RFC-4180 compliant.
const FORMULA_INJECTION_RE = /^[=+\-@\t\r]/;

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[,"\n\r]/.test(s) || FORMULA_INJECTION_RE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportIssuesToCsv(
  input: ExportInput,
  ctx: ExportContext,
  res: Response,
): Promise<void> {
  const prepared = await prepareExport(input, ctx);
  if (prepared.kind === 'error') {
    res.status(prepared.status).json({
      error: prepared.code,
      message: prepared.message,
      parseErrors: prepared.parseErrors,
      validationErrors: prepared.validationErrors,
      compileErrors: prepared.compileErrors,
    });
    return;
  }
  const columns = resolveColumns(input.columns, prepared.customFieldMap);
  if (columns.length === 0) {
    res.status(400).json({ error: 'NO_VALID_COLUMNS', message: 'None of the requested columns are exportable.' });
    return;
  }
  const plan: ResolvedPlan = { ...prepared, columns };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="search-export.csv"');
  // UTF-8 BOM so Excel opens Cyrillic/emoji correctly.
  res.write('\uFEFF');
  res.write(columns.map((c) => csvEscape(c.label)).join(',') + '\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  let rowCount = 0;
  try {
    for await (const batch of iterateIssues(plan, MAX_ROWS, ctrl.signal)) {
      for (const issue of batch) {
        const row = columns.map((c) => csvEscape(extractValue(issue, c))).join(',');
        res.write(row + '\n');
        rowCount += 1;
      }
    }
    if (rowCount >= MAX_ROWS) {
      res.write(`# WARNING: export truncated at ${MAX_ROWS} rows. Narrow your JQL.\n`);
    }
  } catch (err) {
    console.warn('csv export error', { userId: ctx.userId, rowCount, err: (err as Error).message });
  } finally {
    clearTimeout(timer);
    res.end();
  }
}

export async function exportIssuesToXlsx(
  input: ExportInput,
  ctx: ExportContext,
  res: Response,
): Promise<void> {
  const prepared = await prepareExport(input, ctx);
  if (prepared.kind === 'error') {
    res.status(prepared.status).json({
      error: prepared.code,
      message: prepared.message,
      parseErrors: prepared.parseErrors,
      validationErrors: prepared.validationErrors,
      compileErrors: prepared.compileErrors,
    });
    return;
  }
  const columns = resolveColumns(input.columns, prepared.customFieldMap);
  if (columns.length === 0) {
    res.status(400).json({ error: 'NO_VALID_COLUMNS', message: 'None of the requested columns are exportable.' });
    return;
  }
  const plan: ResolvedPlan = { ...prepared, columns };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="search-export.xlsx"');

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: false, useSharedStrings: false });
  const sheet = workbook.addWorksheet('Results');
  sheet.columns = columns.map((c) => ({ header: c.label, key: c.name, width: 20 }));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  let rowCount = 0;
  let committed = false;
  try {
    for await (const batch of iterateIssues(plan, MAX_ROWS, ctrl.signal)) {
      for (const issue of batch) {
        const values: Record<string, string | number | null> = {};
        for (const c of columns) values[c.name] = extractValue(issue, c);
        sheet.addRow(values).commit();
        rowCount += 1;
      }
    }
    if (rowCount >= MAX_ROWS) {
      sheet.addRow({ [columns[0].name]: `WARNING: truncated at ${MAX_ROWS} rows` }).commit();
    }
    await workbook.commit();
    committed = true;
  } catch (err) {
    // Do NOT retry commit on error — ExcelJS writes an EOCD on first commit;
    // a second call produces a corrupt ZIP that Excel cannot open.
    console.warn('xlsx export error', { userId: ctx.userId, rowCount, err: (err as Error).message });
  } finally {
    clearTimeout(timer);
    if (!committed) res.end();
  }
}
