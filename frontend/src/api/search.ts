/**
 * TTSRH-1 PR-9 — тонкий api-клиент для /api/search/*.
 *
 * Публичный API покрывает контракт §5.6 ТЗ:
 *   • searchIssues(jql, startAt?, limit?) — выполнить JQL-запрос.
 *   • validateJql(jql, variant?) — без выполнения, для inline-squiggle'ов.
 *   • getSearchSchema(variant?) — для Basic-builder / help-popover.
 *   • suggestCompletions({jql?, cursor?, field?, operator?, prefix?, variant?}) — автокомплит.
 *   • exportIssues(jql, format, columns?) — возвращает Blob для saveAs.
 *
 * Все methods пробрасывают axios-ошибки — вышележащие store/hook'и ловят статус и
 * достают `error.response.data` для UI-сообщения. Никаких обёрток — frontend
 * остаётся источником правды по UX-flow ошибок.
 */

import api from './client';

// Named fields preserve intellisense/type-checking. Custom-field columns are
// returned by the API under arbitrary string keys — an intersection with a
// Record keeps them accessible (as `unknown`) without suppressing typos on the
// named fields (a bare `[key: string]: unknown` index signature would).
export interface IssueCustomFieldValueRow {
  customFieldId: string;
  /** JSON envelope — values are wrapped as `{ v: <payload> }`. */
  value: unknown;
}

export type IssueSearchRow = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; key: string; name: string };
  assignee: { id: string; name: string; email: string } | null;
  workflowStatus: { id: string; name: string; category: string; color: string | null; systemKey: string | null } | null;
  customFieldValues?: IssueCustomFieldValueRow[];
} & Record<string, unknown>;

export interface SearchIssuesResponse {
  total: number;
  startAt: number;
  limit: number;
  issues: IssueSearchRow[];
  warnings?: Array<{ start: number; end: number; code: string; message: string }>;
  compileWarnings?: Array<{ code: string; message: string }>;
  projectScopeOverflowed?: boolean;
}

export async function searchIssues(
  jql: string,
  opts: { startAt?: number; limit?: number } = {},
): Promise<SearchIssuesResponse> {
  const { data } = await api.post<SearchIssuesResponse>('/search/issues', {
    jql,
    startAt: opts.startAt ?? 0,
    limit: opts.limit ?? 50,
  });
  return data;
}

export interface ValidationResponse {
  valid: boolean;
  errors: Array<{ start: number; end: number; code: string; message: string; hint?: string }>;
  warnings: Array<{ start: number; end: number; code: string; message: string }>;
  ast: unknown | null;
}

export async function validateJql(jql: string, variant?: 'default' | 'checkpoint'): Promise<ValidationResponse> {
  const { data } = await api.post<ValidationResponse>('/search/validate', {
    jql,
    variant,
  });
  return data;
}

export interface SchemaField {
  name: string;
  label: string;
  type: string;
  synonyms: string[];
  operators: string[];
  sortable: boolean;
  custom: boolean;
  description: string | null;
  uuid?: string;
}

export interface SchemaFunction {
  name: string;
  args: Array<{ name: string; type: string; optional: boolean }>;
  returnType: string;
  phase: string;
  description?: string;
}

export interface SearchSchemaResponse {
  variant: 'default' | 'checkpoint';
  fields: SchemaField[];
  functions: SchemaFunction[];
}

export async function getSearchSchema(variant?: 'default' | 'checkpoint'): Promise<SearchSchemaResponse> {
  const { data } = await api.get<SearchSchemaResponse>('/search/schema', {
    params: variant ? { variant } : undefined,
  });
  return data;
}

export interface SuggestRequest {
  jql?: string;
  cursor?: number;
  field?: string;
  operator?: string;
  prefix?: string;
  variant?: 'default' | 'checkpoint';
}

export interface Completion {
  kind: 'field' | 'operator' | 'function' | 'value' | 'keyword';
  label: string;
  insert: string;
  detail?: string;
  icon?: string;
  score: number;
}

export interface SuggestResponse {
  completions: Completion[];
}

export async function suggestCompletions(req: SuggestRequest): Promise<SuggestResponse> {
  const params: Record<string, string | number> = {};
  if (req.jql !== undefined) params.jql = req.jql;
  if (req.cursor !== undefined) params.cursor = req.cursor;
  if (req.field) params.field = req.field;
  if (req.operator) params.operator = req.operator;
  if (req.prefix) params.prefix = req.prefix;
  if (req.variant) params.variant = req.variant;
  const { data } = await api.get<SuggestResponse>('/search/suggest', { params });
  return data;
}

export async function exportIssues(
  jql: string,
  format: 'csv' | 'xlsx',
  columns?: string[],
): Promise<Blob> {
  const { data } = await api.post('/search/export', { jql, format, columns }, { responseType: 'blob' });
  return data as Blob;
}
