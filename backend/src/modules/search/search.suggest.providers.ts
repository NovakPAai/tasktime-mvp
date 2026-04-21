/**
 * TTSRH-1 PR-6 — DB-backed suggesters (TTSRH-25).
 *
 * Each provider queries Prisma with the caller's project scope and returns a
 * ranked list of `Completion` objects. Scope-filtering per R3 ТЗ is applied at
 * the query level (never client-side) — a user searching `assignee = al` must
 * not see `alice@othercorp.com` if they share no projects.
 *
 * Providers are async by impl. The orchestrator routes a single provider per
 * request based on the resolved field's type, so each endpoint call executes
 * exactly one provider — no concurrent fan-out here.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import type { Completion } from './search.suggest.types.js';
import { rankByPrefix } from './search.suggest.rank.js';

const MAX_RESULTS = 20;

// ─── User / assignee / reporter ────────────────────────────────────────────

export async function suggestUsers(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  const prefixLc = prefix.toLowerCase();
  // Deliberate: this filter only returns users with an explicit UserProjectRole
  // row. System-role ADMIN/SUPER_ADMIN users without direct project memberships
  // are excluded — an admin can still self-assign by typing their email, but
  // including every admin in every project's autocomplete would inflate the
  // list and confuse users. Revisit if UX feedback flags this as surprising.
  const users = accessibleProjectIds.length > 0
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          projectRoles: {
            some: { projectId: { in: [...accessibleProjectIds] } },
          },
          ...(prefix
            ? {
                OR: [
                  { name: { contains: prefixLc, mode: 'insensitive' } },
                  { email: { contains: prefixLc, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, email: true },
        take: MAX_RESULTS,
        orderBy: [{ name: 'asc' }],
      })
    : [];

  return rankByPrefix(
    users.map((u) => ({
      kind: 'value' as const,
      label: u.name,
      insert: `"${u.email}"`,
      detail: u.email,
      icon: { kind: 'avatar' as const, value: u.email },
      score: 0,
    })),
    prefix,
  );
}

// ─── Project ───────────────────────────────────────────────────────────────

export async function suggestProjects(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  if (accessibleProjectIds.length === 0) return [];
  const prefixLc = prefix.toLowerCase();
  const projects = await prisma.project.findMany({
    where: {
      id: { in: [...accessibleProjectIds] },
      ...(prefix
        ? {
            OR: [
              { key: { contains: prefixLc, mode: 'insensitive' } },
              { name: { contains: prefixLc, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, key: true, name: true },
    take: MAX_RESULTS,
    orderBy: [{ key: 'asc' }],
  });
  return rankByPrefix(
    projects.map((p) => ({
      kind: 'value' as const,
      label: `${p.key} — ${p.name}`,
      insert: p.key,
      detail: p.name,
      score: 0,
    })),
    prefix,
  );
}

// ─── Workflow status ───────────────────────────────────────────────────────

export async function suggestStatuses(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  // System-key shortcuts first (OPEN/IN_PROGRESS/REVIEW/DONE/CANCELLED).
  const systemKeys = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];
  const base: Completion[] = systemKeys.map((s) => ({
    kind: 'value' as const,
    label: s,
    insert: s,
    detail: 'system key',
    score: 0,
  }));
  // WorkflowStatus rows are tenant-global (no `projectId` column — they form a
  // shared catalogue referenced via WorkflowScheme). Returning all of them here
  // is intentional: the compiler's top-level scope filter (R3) still clips the
  // final issue result to accessible projects, so a leak at suggest layer is
  // bounded to "user sees a status name they can't actually match against".
  if (accessibleProjectIds.length > 0) {
    const statuses = await prisma.workflowStatus.findMany({
      where: prefix
        ? { name: { contains: prefix.toLowerCase(), mode: 'insensitive' } }
        : {},
      select: { id: true, name: true, category: true, color: true },
      take: MAX_RESULTS,
      orderBy: [{ name: 'asc' }],
    });
    for (const s of statuses) {
      base.push({
        kind: 'value',
        label: s.name,
        insert: `"${s.name}"`,
        detail: s.category.toLowerCase(),
        icon: { kind: 'color-dot', value: s.color },
        score: 0,
      });
    }
  }
  return rankByPrefix(base, prefix);
}

// ─── Issue type ────────────────────────────────────────────────────────────

export async function suggestIssueTypes(prefix: string): Promise<Completion[]> {
  const types = await prisma.issueTypeConfig.findMany({
    where: prefix
      ? { name: { contains: prefix.toLowerCase(), mode: 'insensitive' } }
      : {},
    select: { id: true, name: true, systemKey: true, iconName: true, iconColor: true },
    take: MAX_RESULTS,
    orderBy: [{ name: 'asc' }],
  });
  return rankByPrefix(
    types.map((t) => ({
      kind: 'value' as const,
      label: t.name,
      insert: t.systemKey ?? `"${t.name}"`,
      detail: t.systemKey ?? 'custom',
      icon: t.iconName ? { kind: 'svg' as const, value: t.iconName } : undefined,
      score: 0,
    })),
    prefix,
  );
}

// ─── Sprint ────────────────────────────────────────────────────────────────

export async function suggestSprints(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  // Top rows — the three sprint functions. Users tend to want these.
  const functionShortcuts: Completion[] = [
    { kind: 'function', label: 'openSprints()', insert: 'openSprints()', detail: 'Active sprints in your projects', score: 0 },
    { kind: 'function', label: 'closedSprints()', insert: 'closedSprints()', detail: 'Completed sprints', score: 0 },
    { kind: 'function', label: 'futureSprints()', insert: 'futureSprints()', detail: 'Planned sprints', score: 0 },
  ];
  if (accessibleProjectIds.length === 0) return rankByPrefix(functionShortcuts, prefix);
  const sprints = await prisma.sprint.findMany({
    where: {
      projectId: { in: [...accessibleProjectIds] },
      ...(prefix ? { name: { contains: prefix.toLowerCase(), mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true, state: true, startDate: true, endDate: true },
    take: MAX_RESULTS,
    orderBy: [{ startDate: 'desc' }],
  });
  const dynamic: Completion[] = sprints.map((s) => ({
    kind: 'value',
    label: s.name,
    insert: `"${s.name}"`,
    detail: `${s.state.toLowerCase()}${s.startDate ? ` · ${s.startDate.toISOString().slice(0, 10)}` : ''}`,
    score: 0,
  }));
  return rankByPrefix([...functionShortcuts, ...dynamic], prefix);
}

// ─── Release ───────────────────────────────────────────────────────────────

export async function suggestReleases(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  const functionShortcuts: Completion[] = [
    { kind: 'function', label: 'unreleasedVersions()', insert: 'unreleasedVersions()', detail: 'Unreleased versions', score: 0 },
    { kind: 'function', label: 'releasedVersions()', insert: 'releasedVersions()', detail: 'Released versions', score: 0 },
    { kind: 'function', label: 'earliestUnreleasedVersion()', insert: 'earliestUnreleasedVersion()', detail: 'Closest upcoming release', score: 0 },
    { kind: 'function', label: 'latestReleasedVersion()', insert: 'latestReleasedVersion()', detail: 'Last shipped release', score: 0 },
  ];
  if (accessibleProjectIds.length === 0) return rankByPrefix(functionShortcuts, prefix);
  const releases = await prisma.release.findMany({
    where: {
      projectId: { in: [...accessibleProjectIds] },
      ...(prefix ? { name: { contains: prefix.toLowerCase(), mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true, releaseDate: true, plannedDate: true },
    take: MAX_RESULTS,
    orderBy: [{ plannedDate: 'desc' }],
  });
  const dynamic: Completion[] = releases.map((r) => ({
    kind: 'value',
    label: r.name,
    insert: `"${r.name}"`,
    detail: r.releaseDate
      ? `released · ${r.releaseDate.toISOString().slice(0, 10)}`
      : r.plannedDate
        ? `planned · ${r.plannedDate.toISOString().slice(0, 10)}`
        : 'unreleased',
    score: 0,
  }));
  return rankByPrefix([...functionShortcuts, ...dynamic], prefix);
}

// ─── Issue (key-lookup) ────────────────────────────────────────────────────

export async function suggestIssues(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  if (!prefix || accessibleProjectIds.length === 0) return [];
  // Accept both `TTMP-123` and `TTMP-1`-like partials. Extract project key + number.
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)?$/.exec(prefix);
  if (match) {
    const [, projectKey, numStr] = match;
    const proj = await prisma.project.findFirst({
      where: { key: projectKey!.toUpperCase(), id: { in: [...accessibleProjectIds] } },
      select: { id: true, key: true },
    });
    if (!proj) return [];
    const num = numStr ? Number.parseInt(numStr, 10) : null;
    const issues = await prisma.issue.findMany({
      where: {
        projectId: proj.id,
        ...(num != null ? { number: { gte: num, lt: num + 10 } } : {}),
      },
      select: { projectId: true, number: true, title: true, project: { select: { key: true } } },
      take: MAX_RESULTS,
      orderBy: { number: 'asc' },
    });
    return issues.map((i) => ({
      kind: 'value' as const,
      label: `${i.project.key}-${i.number} — ${i.title}`,
      insert: `${i.project.key}-${i.number}`,
      detail: i.title,
      score: 1,
    }));
  }
  // No project-key prefix → fall back to title-substring search across accessible projects.
  const issues = await prisma.issue.findMany({
    where: {
      projectId: { in: [...accessibleProjectIds] },
      title: { contains: prefix.toLowerCase(), mode: 'insensitive' },
    },
    select: { number: true, title: true, project: { select: { key: true } } },
    take: MAX_RESULTS,
    orderBy: { updatedAt: 'desc' },
  });
  return issues.map((i) => ({
    kind: 'value' as const,
    label: `${i.project.key}-${i.number} — ${i.title}`,
    insert: `${i.project.key}-${i.number}`,
    detail: i.title,
    score: 1,
  }));
}

// ─── Label (distinct from issue_custom_field_values.value->>'v' in LABEL-typed CFs) ──

export async function suggestLabels(
  prefix: string,
  accessibleProjectIds: readonly string[],
): Promise<Completion[]> {
  if (accessibleProjectIds.length === 0) return [];
  // Distinct raw-SQL — Prisma typed API can't express DISTINCT on a JSON path.
  // Two R1-critical details:
  //   1. Project-scope filter is the FIRST AND clause with NO bare `OR` at its
  //      level. Splitting it across an OR would bypass scope (pre-push review
  //      caught this as a silent cross-project leak).
  //   2. Array parameters go through `IN (Prisma.join(...))`, not `ANY(...::uuid[])`
  //      — Prisma's template tag serialises JS arrays as positional parameter
  //      placeholders, which `ANY()` cannot consume.
  type Row = { label: string };
  const prefixFilter = prefix
    ? Prisma.sql`AND (icfv.value->'v')::text ILIKE ${`%${prefix.toLowerCase()}%`}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT jsonb_array_elements_text(icfv.value->'v') AS label
    FROM issue_custom_field_values icfv
    JOIN custom_fields cf ON cf.id = icfv.custom_field_id AND cf.field_type = 'LABEL'
    JOIN issues i ON i.id = icfv.issue_id
    WHERE i.project_id IN (${Prisma.join([...accessibleProjectIds])})
      ${prefixFilter}
    LIMIT ${MAX_RESULTS}
  `;
  return rankByPrefix(
    rows.map((r) => ({
      kind: 'value' as const,
      label: r.label,
      insert: `"${r.label}"`,
      score: 0,
    })),
    prefix,
  );
}

// ─── Group (membersOf arg) ─────────────────────────────────────────────────

export async function suggestGroups(prefix: string): Promise<Completion[]> {
  const groups = await prisma.userGroup.findMany({
    where: prefix
      ? { name: { contains: prefix.toLowerCase(), mode: 'insensitive' } }
      : {},
    select: { id: true, name: true, _count: { select: { members: true } } },
    take: MAX_RESULTS,
    orderBy: [{ name: 'asc' }],
  });
  return rankByPrefix(
    groups.map((g) => ({
      kind: 'value' as const,
      label: g.name,
      insert: `"${g.name}"`,
      detail: `${g._count.members} members`,
      score: 0,
    })),
    prefix,
  );
}

// ─── Checkpoint type ───────────────────────────────────────────────────────

export async function suggestCheckpointTypes(prefix: string): Promise<Completion[]> {
  const types = await prisma.checkpointType.findMany({
    where: {
      isActive: true,
      ...(prefix ? { name: { contains: prefix.toLowerCase(), mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true, color: true, weight: true },
    take: MAX_RESULTS,
    orderBy: [{ name: 'asc' }],
  });
  return rankByPrefix(
    types.map((t) => ({
      kind: 'value' as const,
      label: t.name,
      insert: `"${t.name}"`,
      detail: t.weight.toLowerCase(),
      icon: { kind: 'color-dot' as const, value: t.color },
      score: 0,
    })),
    prefix,
  );
}
