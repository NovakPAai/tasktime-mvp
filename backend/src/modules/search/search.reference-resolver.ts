/**
 * Pre-compile resolver for reference-type system-field literals.
 *
 * The compiler maps every TTS-QL system field to a Prisma column, but for
 * `project`, `assignee`, `reporter`, `sprint`, `release`, `type`, `parent`,
 * `epic`, `issue`, `key` that column is a UUID while the user types a
 * human-readable identifier (project key, email, sprint name, issue-type
 * `systemKey`, issue key `TTMP-123`, …). Without translation, the compiled
 * query becomes `uuid = "TTMP"` and always returns zero rows.
 *
 * This module walks the AST, groups the literals by field, and runs one
 * batched Prisma query per field-kind. The result plugs into
 * `CompileContext.referenceValues`. Unknown values are dropped from the map
 * (the compiler passes them through unchanged, so the scope filter or
 * id-mismatch yields zero rows — matching JIRA's behaviour on unknown keys).
 */

import { prisma } from '../../prisma/client.js';
import type { BoolExpr, Expr, QueryNode } from './search.ast.js';

type Literals = Map<string, Set<string>>;

type ReferenceValues = Map<string, Map<string, string>>;

export interface ReferenceResolverContext {
  accessibleProjectIds: readonly string[];
}

export async function resolveReferenceValues(
  ast: QueryNode,
  ctx: ReferenceResolverContext,
): Promise<ReferenceValues> {
  const out: ReferenceValues = new Map();
  const literals = collectReferenceLiterals(ast);
  if (literals.size === 0) return out;

  const tasks: Array<Promise<void>> = [];

  const project = literals.get('project');
  if (project && project.size > 0) {
    tasks.push(resolveProjects(project, ctx, out));
  }
  const assignee = literals.get('assignee');
  const reporter = literals.get('reporter');
  const userLiterals = new Set<string>([...(assignee ?? []), ...(reporter ?? [])]);
  if (userLiterals.size > 0) {
    tasks.push(resolveUsers(userLiterals, ctx, out, {
      fillAssignee: !!assignee && assignee.size > 0,
      fillReporter: !!reporter && reporter.size > 0,
    }));
  }
  const sprint = literals.get('sprint');
  if (sprint && sprint.size > 0) {
    tasks.push(resolveSprints(sprint, ctx, out));
  }
  const release = literals.get('release');
  if (release && release.size > 0) {
    tasks.push(resolveReleases(release, ctx, out));
  }
  const type = literals.get('type');
  if (type && type.size > 0) {
    tasks.push(resolveIssueTypes(type, out));
  }
  const issueLiterals = new Set<string>([
    ...(literals.get('issue') ?? []),
    ...(literals.get('key') ?? []),
    ...(literals.get('parent') ?? []),
    ...(literals.get('epic') ?? []),
  ]);
  if (issueLiterals.size > 0) {
    tasks.push(resolveIssueKeys(issueLiterals, ctx, out, literals));
  }

  await Promise.all(tasks);
  return out;
}

// ─── Field-specific resolvers ──────────────────────────────────────────────

async function resolveProjects(
  values: Set<string>,
  ctx: ReferenceResolverContext,
  out: ReferenceValues,
): Promise<void> {
  if (ctx.accessibleProjectIds.length === 0) return;
  const rows = await prisma.project.findMany({
    where: {
      id: { in: [...ctx.accessibleProjectIds] },
      key: { in: [...values].map(upper) },
    },
    select: { id: true, key: true },
  });
  const map = ensureField(out, 'project');
  for (const r of rows) map.set(r.key.toLowerCase(), r.id);
}

async function resolveUsers(
  values: Set<string>,
  ctx: ReferenceResolverContext,
  out: ReferenceValues,
  fill: { fillAssignee: boolean; fillReporter: boolean },
): Promise<void> {
  if (ctx.accessibleProjectIds.length === 0) return;
  const lower = [...values].map((v) => v.toLowerCase());
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      projectRoles: {
        some: { projectId: { in: [...ctx.accessibleProjectIds] } },
      },
      OR: [
        { email: { in: lower, mode: 'insensitive' } },
        { name: { in: lower, mode: 'insensitive' } },
      ],
    },
    select: { id: true, email: true, name: true },
  });
  const entries: Array<[string, string]> = [];
  for (const r of rows) {
    entries.push([r.email.toLowerCase(), r.id]);
    entries.push([r.name.toLowerCase(), r.id]);
  }
  if (fill.fillAssignee) {
    const m = ensureField(out, 'assignee');
    for (const [k, v] of entries) m.set(k, v);
  }
  if (fill.fillReporter) {
    const m = ensureField(out, 'reporter');
    for (const [k, v] of entries) m.set(k, v);
  }
}

async function resolveSprints(
  values: Set<string>,
  ctx: ReferenceResolverContext,
  out: ReferenceValues,
): Promise<void> {
  if (ctx.accessibleProjectIds.length === 0) return;
  const rows = await prisma.sprint.findMany({
    where: {
      projectId: { in: [...ctx.accessibleProjectIds] },
      name: { in: [...values], mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });
  const map = ensureField(out, 'sprint');
  for (const r of rows) map.set(r.name.toLowerCase(), r.id);
}

async function resolveReleases(
  values: Set<string>,
  ctx: ReferenceResolverContext,
  out: ReferenceValues,
): Promise<void> {
  if (ctx.accessibleProjectIds.length === 0) return;
  const rows = await prisma.release.findMany({
    where: {
      projectId: { in: [...ctx.accessibleProjectIds] },
      name: { in: [...values], mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });
  const map = ensureField(out, 'release');
  for (const r of rows) map.set(r.name.toLowerCase(), r.id);
}

async function resolveIssueTypes(
  values: Set<string>,
  out: ReferenceValues,
): Promise<void> {
  const upperValues = [...values].map(upper);
  const rows = await prisma.issueTypeConfig.findMany({
    where: {
      OR: [
        { systemKey: { in: upperValues } },
        { name: { in: [...values], mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, systemKey: true },
  });
  const map = ensureField(out, 'type');
  for (const r of rows) {
    if (r.systemKey) map.set(r.systemKey.toLowerCase(), r.id);
    map.set(r.name.toLowerCase(), r.id);
  }
}

async function resolveIssueKeys(
  values: Set<string>,
  ctx: ReferenceResolverContext,
  out: ReferenceValues,
  literals: Literals,
): Promise<void> {
  if (ctx.accessibleProjectIds.length === 0) return;
  // Parse `TTMP-123` → { projectKey: 'TTMP', number: 123 }. Malformed values
  // are dropped silently — they will miss the lookup and fall through.
  const parsed: Array<{ raw: string; projectKey: string; number: number }> = [];
  for (const v of values) {
    const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(v.trim());
    if (!m) continue;
    parsed.push({ raw: v, projectKey: m[1]!.toUpperCase(), number: Number.parseInt(m[2]!, 10) });
  }
  if (parsed.length === 0) return;

  const projectKeys = [...new Set(parsed.map((p) => p.projectKey))];
  const projects = await prisma.project.findMany({
    where: { id: { in: [...ctx.accessibleProjectIds] }, key: { in: projectKeys } },
    select: { id: true, key: true },
  });
  const keyToProjectId = new Map(projects.map((p) => [p.key, p.id] as const));

  const numbersByProject = new Map<string, number[]>();
  for (const p of parsed) {
    const projId = keyToProjectId.get(p.projectKey);
    if (!projId) continue;
    const list = numbersByProject.get(projId) ?? [];
    list.push(p.number);
    numbersByProject.set(projId, list);
  }
  if (numbersByProject.size === 0) return;

  const issues = await prisma.issue.findMany({
    where: {
      OR: [...numbersByProject.entries()].map(([projectId, numbers]) => ({
        projectId,
        number: { in: numbers },
      })),
    },
    select: { id: true, number: true, projectId: true },
  });
  const projectIdToKey = new Map([...keyToProjectId.entries()].map(([k, v]) => [v, k] as const));
  const entries: Array<[string, string]> = [];
  for (const i of issues) {
    const projKey = projectIdToKey.get(i.projectId);
    if (!projKey) continue;
    entries.push([`${projKey}-${i.number}`.toLowerCase(), i.id]);
  }
  // Mirror into every issue-typed reference field that was referenced in the AST.
  for (const field of ['issue', 'key', 'parent', 'epic'] as const) {
    if (!literals.has(field)) continue;
    const map = ensureField(out, field);
    for (const [k, v] of entries) map.set(k, v);
  }
}

// ─── AST walker ────────────────────────────────────────────────────────────

/**
 * Collect string-ish literals per reference field name. Case is preserved so
 * downstream resolvers can treat `systemKey` (case-sensitive) and `name`
 * (case-insensitive) differently.
 */
export function collectReferenceLiterals(ast: QueryNode): Literals {
  const out: Literals = new Map();
  const push = (field: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const set = out.get(field) ?? new Set<string>();
    set.add(trimmed);
    out.set(field, set);
  };
  const visitExpr = (field: string, e: Expr) => {
    if (e.kind === 'String' || e.kind === 'Ident') {
      push(field, e.kind === 'String' ? e.value : e.name);
    }
    // Functions + other literal shapes (Number, Bool, etc.) contribute nothing
    // here — they don't map onto the `user-string → row id` translation path.
  };
  const visitBool = (n: BoolExpr) => {
    switch (n.kind) {
      case 'And':
      case 'Or':
        n.children.forEach(visitBool);
        return;
      case 'Not':
        visitBool(n.child);
        return;
      case 'Clause': {
        const fieldName = fieldNameOf(n);
        if (!fieldName) return;
        switch (n.op.kind) {
          case 'Compare':
            visitExpr(fieldName, n.op.value);
            return;
          case 'In':
            n.op.values.forEach((v) => visitExpr(fieldName, v));
            return;
          default:
            return;
        }
      }
    }
  };
  if (ast.where) visitBool(ast.where);
  return out;
}

function fieldNameOf(clause: { field: { kind: string; name?: string } }): string | null {
  const f = clause.field;
  if (f.kind === 'Ident' && typeof f.name === 'string') return f.name.toLowerCase();
  if (f.kind === 'QuotedField' && typeof f.name === 'string') return f.name.toLowerCase();
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function ensureField(map: ReferenceValues, field: string): Map<string, string> {
  let inner = map.get(field);
  if (!inner) {
    inner = new Map();
    map.set(field, inner);
  }
  return inner;
}

function upper(v: string): string {
  return v.toUpperCase();
}
