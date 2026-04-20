/**
 * TTSRH-1 PR-4 — DB-wired function resolver.
 *
 * Walks an AST, collects every DB-dependent function call, de-duplicates by
 * canonical key, and runs one Prisma query per unique call to get the resulting
 * id set (or scalar id). Pure date functions (now, today, startOfX, endOfX) are
 * evaluated by the compiler directly — not here.
 *
 * Caller (PR-5 `search.service.ts`) passes the returned `ResolvedFunctions` into
 * the compiler via `CompileContext.resolved`.
 */

import { prisma } from '../../prisma/client.js';
import type {
  BoolExpr,
  Expr,
  FunctionCall,
  QueryNode,
} from './search.ast.js';
import {
  buildFunctionCallKey,
  type FunctionCallKey,
  type FunctionCallArg,
  type FunctionCallValue,
  type ResolvedFunctions,
} from './search.compile-context.js';

export interface FunctionResolverContext {
  userId: string | null;
  accessibleProjectIds: readonly string[];
  now: Date;
  /**
   * When `variant === 'checkpoint'`, `currentUserId` resolves to `null` (§5.12.4
   * ТЗ) and user-only shortcuts like `myOpenIssues()` should not appear (validator
   * rejects them pre-compile).
   */
  variant: 'default' | 'checkpoint';
}

/**
 * Walk the AST and collect unique function-call signatures (name + args). Used
 * to batch DB queries — if the same call appears 5 times in a query, we resolve
 * it once.
 */
export function collectFunctionCalls(ast: QueryNode): Map<FunctionCallKey, FunctionCall> {
  const out = new Map<FunctionCallKey, FunctionCall>();
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
        switch (n.op.kind) {
          case 'Compare':
            visitExpr(n.op.value);
            return;
          case 'In':
            n.op.values.forEach(visitExpr);
            return;
          case 'InFunction':
            collectCall(n.op.func);
            // Function args themselves may contain nested calls.
            n.op.func.args.forEach(visitExpr);
            return;
          case 'IsEmpty':
          case 'History':
            return;
        }
      }
    }
  };
  const visitExpr = (e: Expr) => {
    if (e.kind === 'Function') {
      collectCall(e);
      e.args.forEach(visitExpr);
    }
  };
  const collectCall = (c: FunctionCall) => {
    const key = buildFunctionCallKey(c.name, c.args.map(argToKey));
    if (!out.has(key)) out.set(key, c);
  };

  if (ast.where) visitBool(ast.where);
  for (const s of ast.orderBy) {
    // ORDER BY has only FieldRef — no function calls. Nothing to collect.
    void s;
  }
  return out;
}

function argToKey(e: Expr): FunctionCallArg {
  switch (e.kind) {
    case 'String': return { kind: 'string', value: e.value };
    case 'Number': return { kind: 'number', value: e.value };
    case 'Bool':   return { kind: 'bool', value: e.value };
    case 'Null':
    case 'Empty':  return { kind: 'null' };
    case 'Ident':  return { kind: 'ident', name: e.name };
    case 'RelativeDate': return { kind: 'string', value: e.raw };
    case 'Function': return { kind: 'string', value: `${e.name}(...)` };
  }
}

/**
 * Resolve every DB-dependent function call from the AST into actual id sets.
 * Returns a `ResolvedFunctions` suitable to feed the compiler. Functions that
 * aren't DB-dependent (pure date helpers, currentUser) are handled here or in
 * compiler; we only hit Prisma for dynamic ones.
 */
export async function resolveFunctions(
  ast: QueryNode,
  fnCtx: FunctionResolverContext,
): Promise<ResolvedFunctions> {
  const calls = collectFunctionCalls(ast);
  const resolved = new Map<FunctionCallKey, FunctionCallValue>();

  for (const [key, call] of calls) {
    const lc = call.name.toLowerCase();
    // Pure functions are evaluated by the compiler — skip DB query here.
    if (PURE_DATE_FNS.has(lc) || lc === 'currentuser') continue;

    const value = await resolveOne(call, fnCtx);
    resolved.set(key, value);
  }

  return {
    currentUserId: fnCtx.variant === 'checkpoint' ? null : fnCtx.userId,
    calls: resolved,
  };
}

const PURE_DATE_FNS = new Set([
  'now',
  'today',
  'startofday', 'endofday',
  'startofweek', 'endofweek',
  'startofmonth', 'endofmonth',
  'startofyear', 'endofyear',
]);

async function resolveOne(call: FunctionCall, ctx: FunctionResolverContext): Promise<FunctionCallValue> {
  const lc = call.name.toLowerCase();
  try {
    switch (lc) {
      case 'membersof': return await resolveMembersOf(call);
      case 'opensprints': return await resolveSprintsByState('ACTIVE', ctx);
      case 'closedsprints': return await resolveSprintsByState('CLOSED', ctx);
      case 'futuresprints': return await resolveSprintsByState('PLANNED', ctx);
      case 'unreleasedversions': return await resolveReleases(call, 'unreleased', ctx);
      case 'releasedversions': return await resolveReleases(call, 'released', ctx);
      case 'earliestunreleasedversion': return await resolveEarliestUnreleased(call, ctx);
      case 'latestreleasedversion': return await resolveLatestReleased(call, ctx);
      case 'linkedissues': return await resolveLinkedIssues(call, ctx);
      case 'subtasksof': return await resolveSubtasksOf(call, ctx);
      case 'epicissues': return await resolveEpicIssues(call, ctx);
      case 'myopenissues': return await resolveMyOpenIssues(ctx);
      default:
        return { kind: 'resolve-failed', reason: `Function \`${call.name}()\` resolver not implemented.` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'resolve-failed', reason: `Resolving \`${call.name}()\` failed: ${msg}` };
  }
}

// ─── Per-function resolvers ─────────────────────────────────────────────────

async function resolveMembersOf(call: FunctionCall): Promise<FunctionCallValue> {
  const groupName = stringArg(call, 0);
  if (!groupName) return { kind: 'resolve-failed', reason: '`membersOf()` requires a group name argument.' };
  const group = await prisma.userGroup.findFirst({
    where: { name: groupName },
    select: {
      members: { select: { userId: true } },
    },
  });
  if (!group) return { kind: 'id-list', ids: [] };
  return { kind: 'id-list', ids: group.members.map((m) => m.userId) };
}

async function resolveSprintsByState(
  state: 'PLANNED' | 'ACTIVE' | 'CLOSED',
  ctx: FunctionResolverContext,
): Promise<FunctionCallValue> {
  const sprints = await prisma.sprint.findMany({
    where: {
      state,
      projectId: { in: [...ctx.accessibleProjectIds] },
    },
    select: { id: true },
  });
  return { kind: 'id-list', ids: sprints.map((s) => s.id) };
}

async function resolveReleases(
  call: FunctionCall,
  mode: 'unreleased' | 'released',
  ctx: FunctionResolverContext,
): Promise<FunctionCallValue> {
  const projectKey = stringArg(call, 0);
  const project = projectKey
    ? await prisma.project.findFirst({ where: { key: projectKey }, select: { id: true } })
    : null;
  if (projectKey && !project) return { kind: 'id-list', ids: [] };
  // No `isReleased` column on `Release`. We treat `releaseDate <= now` as "released"
  // and everything else as unreleased, mirroring the convention used by the release
  // workflow engine. If a project later adds a terminal-state boolean, switch to that.
  const scope = project ? { projectId: project.id } : { projectId: { in: [...ctx.accessibleProjectIds] } };
  const releases = await prisma.release.findMany({
    where: mode === 'released'
      ? { AND: [scope, { releaseDate: { not: null } }, { releaseDate: { lte: ctx.now } }] }
      : { AND: [scope, { OR: [{ releaseDate: null }, { releaseDate: { gt: ctx.now } }] }] },
    select: { id: true },
  });
  return { kind: 'id-list', ids: releases.map((r) => r.id) };
}

async function resolveEarliestUnreleased(
  call: FunctionCall,
  ctx: FunctionResolverContext,
): Promise<FunctionCallValue> {
  const projectKey = stringArg(call, 0);
  const project = projectKey
    ? await prisma.project.findFirst({ where: { key: projectKey }, select: { id: true } })
    : null;
  if (projectKey && !project) return { kind: 'scalar-id', id: null };
  const scope = project ? { projectId: project.id } : { projectId: { in: [...ctx.accessibleProjectIds] } };
  const release = await prisma.release.findFirst({
    where: { AND: [scope, { OR: [{ releaseDate: null }, { releaseDate: { gt: ctx.now } }] }] },
    orderBy: { plannedDate: 'asc' },
    select: { id: true },
  });
  return { kind: 'scalar-id', id: release?.id ?? null };
}

async function resolveLatestReleased(
  call: FunctionCall,
  ctx: FunctionResolverContext,
): Promise<FunctionCallValue> {
  const projectKey = stringArg(call, 0);
  const project = projectKey
    ? await prisma.project.findFirst({ where: { key: projectKey }, select: { id: true } })
    : null;
  if (projectKey && !project) return { kind: 'scalar-id', id: null };
  const scope = project ? { projectId: project.id } : { projectId: { in: [...ctx.accessibleProjectIds] } };
  const release = await prisma.release.findFirst({
    where: { AND: [scope, { releaseDate: { not: null } }, { releaseDate: { lte: ctx.now } }] },
    orderBy: { releaseDate: 'desc' },
    select: { id: true },
  });
  return { kind: 'scalar-id', id: release?.id ?? null };
}

async function resolveLinkedIssues(call: FunctionCall, ctx: FunctionResolverContext): Promise<FunctionCallValue> {
  const key = stringArg(call, 0);
  if (!key) return { kind: 'resolve-failed', reason: '`linkedIssues()` requires an issue-key argument.' };
  const linkTypeName = stringArg(call, 1);
  const source = await findIssueByKey(key, ctx);
  if (!source) return { kind: 'id-list', ids: [] };
  // `IssueLink.linkType` is a FK relation to `IssueLinkType`, not a scalar — filter
  // via the relation's `name`. Unknown link-type names produce an empty set, not an
  // error (matches how Jira silently ignores unrecognised link kinds).
  const links = await prisma.issueLink.findMany({
    where: {
      OR: [{ sourceIssueId: source.id }, { targetIssueId: source.id }],
      ...(linkTypeName ? { linkType: { name: linkTypeName } } : {}),
    },
    select: { sourceIssueId: true, targetIssueId: true },
  });
  const ids = new Set<string>();
  for (const l of links) {
    if (l.sourceIssueId !== source.id) ids.add(l.sourceIssueId);
    if (l.targetIssueId !== source.id) ids.add(l.targetIssueId);
  }
  return { kind: 'id-list', ids: [...ids] };
}

async function resolveSubtasksOf(call: FunctionCall, ctx: FunctionResolverContext): Promise<FunctionCallValue> {
  const key = stringArg(call, 0);
  if (!key) return { kind: 'resolve-failed', reason: '`subtasksOf()` requires an issue-key argument.' };
  const parent = await findIssueByKey(key, ctx);
  if (!parent) return { kind: 'id-list', ids: [] };
  const subtasks = await prisma.issue.findMany({
    where: { parentId: parent.id },
    select: { id: true },
  });
  return { kind: 'id-list', ids: subtasks.map((i) => i.id) };
}

async function resolveEpicIssues(call: FunctionCall, ctx: FunctionResolverContext): Promise<FunctionCallValue> {
  const key = stringArg(call, 0);
  if (!key) return { kind: 'resolve-failed', reason: '`epicIssues()` requires an issue-key argument.' };
  const epic = await findIssueByKey(key, ctx);
  if (!epic) return { kind: 'id-list', ids: [] };
  const issues = await prisma.issue.findMany({
    where: { parentId: epic.id },
    select: { id: true },
  });
  return { kind: 'id-list', ids: issues.map((i) => i.id) };
}

async function resolveMyOpenIssues(ctx: FunctionResolverContext): Promise<FunctionCallValue> {
  if (!ctx.userId) return { kind: 'id-list', ids: [] };
  const issues = await prisma.issue.findMany({
    where: {
      assigneeId: ctx.userId,
      status: { not: 'DONE' },
      projectId: { in: [...ctx.accessibleProjectIds] },
    },
    select: { id: true },
  });
  return { kind: 'id-list', ids: issues.map((i) => i.id) };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stringArg(call: FunctionCall, i: number): string | null {
  const a = call.args[i];
  if (!a) return null;
  if (a.kind === 'String') return a.value;
  if (a.kind === 'Ident') return a.name;
  return null;
}

/**
 * Resolve an issue by its `PROJECTKEY-NUMBER` identifier. Scoped to the caller's
 * accessible projects — a user cannot reference issues from projects they don't
 * see (R3 ТЗ).
 */
async function findIssueByKey(key: string, ctx: FunctionResolverContext): Promise<{ id: string } | null> {
  const m = /^([A-Z][A-Z0-9]*)-(\d+)$/.exec(key.trim());
  if (!m) return null;
  const [, projectKey, numStr] = m;
  const project = await prisma.project.findFirst({
    where: { key: projectKey, id: { in: [...ctx.accessibleProjectIds] } },
    select: { id: true },
  });
  if (!project) return null;
  return prisma.issue.findFirst({
    where: { projectId: project.id, number: Number.parseInt(numStr!, 10) },
    select: { id: true },
  });
}
