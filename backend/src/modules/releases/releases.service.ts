import type { Prisma, SystemRoleType } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';
import { resolveWorkflowForRelease, getAvailableTransitions } from './release-workflow-engine.service.js';
import type {
  CreateReleaseDto,
  UpdateReleaseDto,
  ListReleasesQueryDto,
  ReleaseItemsAddDto,
  CloneReleaseDto,
  ListReleaseItemsQueryDto,
} from './releases.dto.js';

// ─── Cache helpers ────────────────────────────────────────────────────────────

const RELEASES_LIST_CACHE_TTL = 60; // 60 seconds
const releasesListCacheKey = (suffix: string) => `releases:list:${suffix}`;

export async function invalidateReleasesListCache(): Promise<void> {
  // Pattern-based invalidation: delete known keys; for simplicity use a sentinel
  await delCachedJson('releases:list:*');
}

// ─── RM-03.1: GET /api/releases — global list ────────────────────────────────

export async function listReleasesGlobal(query: ListReleasesQueryDto) {
  const { type, statusId, statusCategory, projectId, from, to, releaseDateFrom, releaseDateTo,
    search, page, limit, sortBy, sortDir } = query;

  const where: Prisma.ReleaseWhereInput = {};

  if (type) where.type = type;
  if (statusId) {
    const ids = statusId.split(',').map((s) => s.trim()).filter(Boolean);
    where.statusId = ids.length === 1 ? ids[0] : { in: ids };
  }
  if (statusCategory) where.status = { category: statusCategory };
  if (projectId) {
    // For INTEGRATION releases (projectId=null), filter by items belonging to this project
    // For ATOMIC releases (projectId=value), filter by projectId directly
    const isIntegrationQuery = type === 'INTEGRATION';
    if (isIntegrationQuery) {
      where.items = { some: { issue: { projectId } } };
    } else {
      where.projectId = projectId;
    }
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + 'T23:59:59Z') } : {}),
    };
  }
  if (releaseDateFrom || releaseDateTo) {
    where.releaseDate = {
      ...(releaseDateFrom ? { gte: new Date(releaseDateFrom) } : {}),
      ...(releaseDateTo ? { lte: new Date(releaseDateTo) } : {}),
    };
  }

  const orderBy: Prisma.ReleaseOrderByWithRelationInput = { [sortBy]: sortDir };

  // Use a deterministic hash to avoid prefix collisions from base64 truncation
  const payload = JSON.stringify({ where, orderBy, page, limit });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = Math.imul(31, hash) + payload.charCodeAt(i) | 0;
  }
  const cacheKey = releasesListCacheKey((hash >>> 0).toString(36));

  const cached = await getCachedJson<{ data: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(cacheKey);
  if (cached) return cached;

  const [releases, total] = await Promise.all([
    prisma.release.findMany({
      where,
      include: {
        status: { select: { id: true, name: true, category: true, color: true } },
        project: { select: { id: true, name: true, key: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true, sprints: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.release.count({ where }),
  ]);

  // For INTEGRATION releases, attach _projects array (keys of projects from items)
  const enriched = await Promise.all(
    releases.map(async (r) => {
      if (r.type !== 'INTEGRATION') return r;
      const projectKeys = await prisma.issue.findMany({
        where: { releaseItems: { some: { releaseId: r.id } } },
        select: { project: { select: { key: true } } },
        distinct: ['projectId'],
      });
      return {
        ...r,
        _projects: projectKeys.map((i) => i.project.key),
      };
    }),
  );

  const result = {
    data: enriched,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
  await setCachedJson(cacheKey, result, RELEASES_LIST_CACHE_TTL);
  return result;
}

// ─── RM-03.2: POST /api/releases — create with type + auto workflow status ────

export async function createReleaseGlobal(dto: CreateReleaseDto, createdById: string) {
  // Validate ATOMIC / INTEGRATION constraints
  if (dto.type === 'ATOMIC' && !dto.projectId) {
    throw new AppError(422, 'projectId is required for ATOMIC release');
  }
  if (dto.type === 'INTEGRATION' && dto.projectId) {
    throw new AppError(422, 'projectId must be absent for INTEGRATION release');
  }

  if (dto.projectId) {
    const project = await prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new AppError(404, 'Project not found');
  }

  // Name uniqueness: ATOMIC — scoped to project; INTEGRATION — globally unique (projectId IS NULL)
  const existingName = await prisma.release.findFirst({
    where: {
      name: dto.name,
      ...(dto.type === 'ATOMIC'
        ? { projectId: dto.projectId }
        : { projectId: null }),
    },
  });
  if (existingName) throw new AppError(409, 'Release with this name already exists');

  // Resolve initial workflow status
  let statusId: string | null = null;
  let workflowId: string | null = dto.workflowId ?? null;

  const releaseType = dto.type ?? 'ATOMIC';

  try {
    const workflow = await resolveWorkflowForRelease({
      id: 'new',
      workflowId: workflowId,
      type: releaseType,
    });

    // If the caller provided an explicit workflowId, verify it is compatible with
    // the release type (a type-specific workflow must not be used for another type).
    if (dto.workflowId && workflow.releaseType !== null && workflow.releaseType !== releaseType) {
      throw new AppError(
        422,
        `WORKFLOW_INCOMPATIBLE_WITH_RELEASE_TYPE: workflow is restricted to ${workflow.releaseType} releases`,
      );
    }

    workflowId = workflow.id;
    const initialStep = workflow.steps.find((s) => s.isInitial);
    if (initialStep) statusId = initialStep.statusId;
  } catch (err) {
    // Only swallow "no workflow configured" — propagate real DB / config errors
    if (!(err instanceof AppError) || err.message !== 'NO_RELEASE_WORKFLOW_CONFIGURED') {
      throw err;
    }
  }

  const release = await prisma.release.create({
    data: {
      type: releaseType,
      projectId: dto.projectId ?? null,
      name: dto.name,
      description: dto.description,
      level: dto.level ?? 'MINOR',
      statusId,
      workflowId,
      createdById,
      plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
    },
    include: {
      status: { select: { id: true, name: true, category: true, color: true } },
      project: { select: { id: true, name: true, key: true } },
    },
  });

  await invalidateReleasesListCache();
  return release;
}

// ─── RM-03.3: PATCH /api/releases/:id — update (immutable: type, projectId) ──

export async function updateRelease(id: string, dto: UpdateReleaseDto) {
  const release = await prisma.release.findUnique({
    where: { id },
    include: { status: true },
  });
  if (!release) throw new AppError(404, 'Release not found');

  // If status is in DONE category — only description can be changed
  if (release.status?.category === 'DONE') {
    const forbiddenFields = (['name', 'level', 'plannedDate', 'releaseDate'] as const).filter(
      (f) => dto[f] !== undefined,
    );
    if (forbiddenFields.length > 0) {
      throw new AppError(
        422,
        `Cannot update ${forbiddenFields.join(', ')} on a release in DONE status`,
      );
    }
  }

  // Name uniqueness check (scoped same as create)
  if (dto.name !== undefined && dto.name !== release.name) {
    const existing = await prisma.release.findFirst({
      where: {
        name: dto.name,
        id: { not: id },
        ...(release.projectId ? { projectId: release.projectId } : { projectId: null }),
      },
    });
    if (existing) throw new AppError(409, 'Release with this name already exists');
  }

  const updated = await prisma.release.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.level !== undefined && { level: dto.level }),
      ...(dto.plannedDate !== undefined && {
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
      }),
      ...(dto.releaseDate !== undefined && {
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
      }),
    },
    include: {
      status: { select: { id: true, name: true, category: true, color: true } },
      project: { select: { id: true, name: true, key: true } },
    },
  });
  await invalidateReleasesListCache();
  return updated;
}

// ─── RM-03.4: DELETE /api/releases/:id ────────────────────────────────────────

export async function deleteRelease(id: string): Promise<void> {
  const release = await prisma.release.findUnique({
    where: { id },
    include: { status: true },
  });
  if (!release) throw new AppError(404, 'Release not found');

  // Forbid delete if status category is DONE
  if (release.status?.category === 'DONE') {
    throw new AppError(422, 'Cannot delete a release in DONE status');
  }

  // Atomic: nullify sprint refs and delete release together
  await prisma.$transaction([
    prisma.sprint.updateMany({
      where: { releaseId: id },
      data: { releaseId: null },
    }),
    // ReleaseItem rows cascade-deleted by onDelete: Cascade on the FK
    prisma.release.delete({ where: { id } }),
  ]);
  await invalidateReleasesListCache();
}

// ─── GET /releases/:id — single release ──────────────────────────────────────

export async function getRelease(id: string) {
  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      status: { select: { id: true, name: true, category: true, color: true } },
      project: { select: { id: true, name: true, key: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { items: true, sprints: true } },
    },
  });
  if (!release) throw new AppError(404, 'Release not found');
  return release;
}

// ─── GET /releases/:id/history — audit log ────────────────────────────────────

export async function getReleaseHistory(id: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');
  return prisma.auditLog.findMany({
    where: { entityType: 'release', entityId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

// ─── RM-03.5: ReleaseItem CRUD ────────────────────────────────────────────────

export async function addReleaseItems(releaseId: string, dto: ReleaseItemsAddDto, addedById: string) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { status: true },
  });
  if (!release) throw new AppError(404, 'Release not found');

  // Forbid for DONE / CANCELLED status categories
  if (release.status?.category === 'DONE' || release.status?.category === 'CANCELLED') {
    throw new AppError(422, 'Cannot add items to a release in DONE/CANCELLED status');
  }

  // Validate issues exist
  const issues = await prisma.issue.findMany({
    where: { id: { in: dto.issueIds } },
    select: { id: true, projectId: true },
  });
  if (issues.length !== dto.issueIds.length) {
    throw new AppError(404, 'One or more issues not found');
  }

  // ATOMIC: only issues from the same project
  if (release.type === 'ATOMIC' && release.projectId) {
    const wrongProject = issues.find((i) => i.projectId !== release.projectId);
    if (wrongProject) {
      throw new AppError(
        422,
        'ATOMIC release can only contain issues from its own project',
      );
    }
  }

  // Upsert each item (skip if already exists via createMany skipDuplicates)
  await prisma.releaseItem.createMany({
    data: dto.issueIds.map((issueId) => ({
      releaseId,
      issueId,
      addedById,
    })),
    skipDuplicates: true,
  });
}

export async function removeReleaseItems(releaseId: string, issueIds: string[]) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { status: true },
  });
  if (!release) throw new AppError(404, 'Release not found');

  if (release.status?.category === 'DONE' || release.status?.category === 'CANCELLED') {
    throw new AppError(422, 'Cannot remove items from a release in DONE/CANCELLED status');
  }

  await prisma.releaseItem.deleteMany({
    where: { releaseId, issueId: { in: issueIds } },
  });
}

export async function listReleaseItems(releaseId: string, query: ListReleaseItemsQueryDto) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');

  const { page, limit, projectId, status } = query;

  const where: Prisma.ReleaseItemWhereInput = { releaseId };
  if (projectId && status) {
    where.issue = { projectId, workflowStatus: { name: status } };
  } else if (projectId) {
    where.issue = { projectId };
  } else if (status) {
    where.issue = { workflowStatus: { name: status } };
  }

  const [items, total] = await Promise.all([
    prisma.releaseItem.findMany({
      where,
      include: {
        issue: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            priority: true,
            projectId: true,
            project: { select: { id: true, name: true, key: true } },
            assignee: { select: { id: true, name: true } },
            issueTypeConfig: { select: { id: true, name: true, systemKey: true, iconColor: true } },
            workflowStatus: { select: { id: true, name: true, category: true, color: true } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.releaseItem.count({ where }),
  ]);

  return {
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── RM-03.7: GET /releases/:id/readiness — extended metrics ─────────────────

export async function getReleaseReadiness(id: string, actorId?: string, actorRoles?: SystemRoleType[]) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');

  const [
    totalSprints,
    closedSprints,
    totalItems,
    doneItems,
    cancelledItems,
    inProgressItems,
  ] = await Promise.all([
    prisma.sprint.count({ where: { releaseId: id } }),
    prisma.sprint.count({ where: { releaseId: id, state: 'CLOSED' } }),
    prisma.releaseItem.count({ where: { releaseId: id } }),
    prisma.releaseItem.count({
      where: {
        releaseId: id,
        issue: { workflowStatus: { category: 'DONE' } },
      },
    }),
    // cancelledItems: issues whose workflow status name contains "cancel".
    // WorkflowStatus has no CANCELLED category — use status name heuristic.
    // Exclude items already counted as doneItems (category=DONE) to avoid
    // double-counting statuses like "Cancelled" that may sit in DONE category.
    prisma.releaseItem.count({
      where: {
        releaseId: id,
        issue: {
          workflowStatus: {
            name: { contains: 'cancel', mode: 'insensitive' },
            category: { not: 'DONE' },
          },
        },
      },
    }),
    prisma.releaseItem.count({
      where: {
        releaseId: id,
        issue: { workflowStatus: { category: 'IN_PROGRESS' } },
      },
    }),
  ]);

  const completionPercent =
    totalItems > 0 ? Math.round(((doneItems + cancelledItems) / totalItems) * 100) : 0;

  // byProject — breakdown for INTEGRATION releases
  let byProject: Array<{ project: { id: string; key: string; name: string }; total: number; done: number; inProgress: number }> = [];
  if (release.type === 'INTEGRATION') {
    const projectBreakdown = await prisma.$queryRaw<
      Array<{ project_id: string; project_key: string; project_name: string; total: bigint; done: bigint; in_progress: bigint }>
    >`
      SELECT
        p.id as project_id,
        p.key as project_key,
        p.name as project_name,
        COUNT(ri.id) as total,
        COUNT(CASE WHEN ws.category = 'DONE' THEN 1 END) as done,
        COUNT(CASE WHEN ws.category = 'IN_PROGRESS' THEN 1 END) as in_progress
      FROM release_items ri
      JOIN issues i ON i.id = ri.issue_id
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN workflow_statuses ws ON ws.id = i.workflow_status_id
      WHERE ri.release_id = ${id}
      GROUP BY p.id, p.key, p.name
    `;
    byProject = projectBreakdown.map((row) => ({
      project: { id: row.project_id, key: row.project_key, name: row.project_name },
      total: Number(row.total),
      done: Number(row.done),
      inProgress: Number(row.in_progress ?? 0),
    }));
  }

  // availableTransitions — only when caller is authenticated
  let availableTransitions = undefined;
  if (actorId && actorRoles) {
    try {
      const transitionsResult = await getAvailableTransitions(id, actorId, actorRoles);
      availableTransitions = transitionsResult.transitions;
    } catch {
      // If no workflow configured — omit the field
    }
  }

  return {
    totalSprints,
    closedSprints,
    totalItems,
    doneItems,
    cancelledItems,
    inProgressItems,
    completionPercent,
    byProject,
    ...(availableTransitions !== undefined && { availableTransitions }),
  };
}

// ─── RM-03.8: POST /releases/:id/clone ────────────────────────────────────────

export async function cloneRelease(id: string, dto: CloneReleaseDto, createdById: string) {
  const source = await prisma.release.findUnique({
    where: { id },
    include: {
      items: true,
      sprints: { select: { id: true } },
    },
  });
  if (!source) throw new AppError(404, 'Release not found');

  const newType = dto.type ?? source.type;
  const newProjectId =
    dto.projectId !== undefined ? dto.projectId : source.projectId;

  // Validate ATOMIC / INTEGRATION constraints
  if (newType === 'ATOMIC' && !newProjectId) {
    throw new AppError(422, 'projectId is required for ATOMIC release');
  }
  if (newType === 'INTEGRATION' && newProjectId) {
    throw new AppError(422, 'projectId must be absent for INTEGRATION release');
  }

  // Auto-generate name if not provided
  const newName = dto.name ?? `${source.name} (copy)`;

  // Check name uniqueness
  const existing = await prisma.release.findFirst({
    where: {
      name: newName,
      ...(newType === 'ATOMIC' ? { projectId: newProjectId } : { projectId: null }),
    },
  });
  if (existing) throw new AppError(409, `Release named "${newName}" already exists`);

  // Resolve initial workflow status
  let statusId: string | null = null;
  let workflowId: string | null = source.workflowId;

  try {
    const workflow = await resolveWorkflowForRelease({
      id: 'new',
      workflowId,
      type: newType,
    });
    workflowId = workflow.id;
    const initialStep = workflow.steps.find((s) => s.isInitial);
    if (initialStep) statusId = initialStep.statusId;
  } catch (err) {
    if (!(err instanceof AppError) || err.message !== 'NO_RELEASE_WORKFLOW_CONFIGURED') {
      throw err;
    }
  }

  // Atomic: create clone, items, sprints reassignment and audit in one transaction
  const [cloned] = await prisma.$transaction(async (tx) => {
    const created = await tx.release.create({
      data: {
        type: newType,
        projectId: newProjectId ?? null,
        name: newName,
        description: source.description,
        level: source.level,
        statusId,
        workflowId,
        createdById,
      },
      include: {
        status: { select: { id: true, name: true, category: true, color: true } },
        project: { select: { id: true, name: true, key: true } },
      },
    });

    if (dto.cloneItems && source.items.length > 0) {
      await tx.releaseItem.createMany({
        data: source.items.map((item) => ({
          releaseId: created.id,
          issueId: item.issueId,
          addedById: createdById,
        })),
        skipDuplicates: true,
      });
    }

    if (dto.cloneSprints && source.sprints.length > 0) {
      await tx.sprint.updateMany({
        where: { id: { in: source.sprints.map((s) => s.id) } },
        data: { releaseId: created.id },
      });
    }

    await tx.auditLog.create({
      data: {
        action: 'release.cloned',
        entityType: 'release',
        entityId: created.id,
        userId: createdById,
        details: {
          sourceReleaseId: id,
          sourceName: source.name,
          cloneItems: dto.cloneItems,
          cloneSprints: dto.cloneSprints,
        } as Prisma.InputJsonValue,
      },
    });

    return [created];
  });

  await invalidateReleasesListCache();
  return cloned;
}

// ─── Legacy helpers (kept for old project-scoped route) ───────────────────────

export async function listReleases(projectId: string) {
  return prisma.release.findMany({
    where: { projectId },
    include: {
      status: { select: { id: true, name: true, category: true, color: true } },
      _count: { select: { items: true, sprints: true } },
      project: { select: { id: true, name: true, key: true } },
    },
    orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getReleaseWithIssues(id: string) {
  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      status: { select: { id: true, name: true, category: true, color: true } },
      _count: { select: { items: true, sprints: true } },
      items: {
        include: {
          issue: {
            select: {
              id: true,
              projectId: true,
              number: true,
              title: true,
              issueTypeConfig: true,
              status: true,
              priority: true,
              updatedAt: true,
              assignee: { select: { id: true, name: true } },
              project: { select: { id: true, name: true, key: true } },
            },
          },
        },
        orderBy: { addedAt: 'desc' },
      },
      sprints: {
        select: {
          id: true,
          name: true,
          state: true,
          startDate: true,
          endDate: true,
          _count: { select: { issues: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      project: { select: { id: true, name: true, key: true } },
    },
  });

  if (!release) throw new AppError(404, 'Release not found');
  return release;
}

export async function getReleaseSprints(id: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');

  return prisma.sprint.findMany({
    where: { releaseId: id },
    include: {
      _count: { select: { issues: true } },
      issues: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addSprintsToRelease(releaseId: string, sprintIds: string[]) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');

  const sprints = await prisma.sprint.findMany({
    where: { id: { in: sprintIds } },
    select: { id: true, name: true, projectId: true, releaseId: true },
  });

  if (sprints.length !== sprintIds.length) {
    throw new AppError(404, 'One or more sprints not found');
  }

  for (const sprint of sprints) {
    if (release.projectId && sprint.projectId !== release.projectId) {
      throw new AppError(400, `Sprint "${sprint.name}" belongs to a different project`);
    }
    if (sprint.releaseId && sprint.releaseId !== releaseId) {
      throw new AppError(400, `Sprint "${sprint.name}" is already assigned to another release`);
    }
  }

  await prisma.sprint.updateMany({
    where: { id: { in: sprintIds } },
    data: { releaseId },
  });
}

export async function removeSprintsFromRelease(releaseId: string, sprintIds: string[]) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');

  await prisma.sprint.updateMany({
    where: { id: { in: sprintIds }, releaseId },
    data: { releaseId: null },
  });
}

// Legacy: kept for backward compat
export async function addIssuesToRelease(releaseId: string, issueIds: string[]) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');

  await prisma.issue.updateMany({
    where: { id: { in: issueIds }, ...(release.projectId ? { projectId: release.projectId } : {}) },
    data: { releaseId },
  });
}

export async function removeIssuesFromRelease(releaseId: string, issueIds: string[]) {
  await prisma.issue.updateMany({
    where: { id: { in: issueIds }, releaseId },
    data: { releaseId: null },
  });
}

// Deprecated stubs — kept for legacy handlers
export async function markReleaseReady(): Promise<never> {
  throw new AppError(410, 'Deprecated');
}

export async function markReleaseReleased(): Promise<never> {
  throw new AppError(410, 'Deprecated');
}
