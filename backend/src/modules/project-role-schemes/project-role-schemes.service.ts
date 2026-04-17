import type { Prisma, ProjectPermission } from '@prisma/client';
import { ProjectRole } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson, delCacheByPrefix } from '../../shared/redis.js';
import { invalidateProjectEffectivePermissions } from '../../shared/middleware/rbac.js';
import type {
  CreateSchemeDto,
  UpdateSchemeDto,
  CreateRoleDefinitionDto,
  UpdateRoleDefinitionDto,
  UpdatePermissionsDto,
} from './project-role-schemes.dto.js';

const PROJECT_SCHEME_KEY = (projectId: string) => `rbac:project:${projectId}:scheme`;

async function invalidateSchemeCache(schemeId: string) {
  const bindings = await prisma.projectRoleSchemeProject.findMany({
    where: { schemeId },
    select: { projectId: true },
  });
  await Promise.all(bindings.map(b => delCachedJson(PROJECT_SCHEME_KEY(b.projectId))));
}

/** Invalidate per-user permission cache for all projects bound to a scheme.
 * Call after any change that affects permission resolution (permissions matrix, role membership).
 *
 * AI review #65 round 4 🟠 — delegates to the exported `invalidateProjectEffectivePermissions`
 * helper which does a prefix SCAN+DELETE over `rbac:effective:{projectId}:*`. This covers every
 * cached user for the project, including ones who just lost access via this scheme change. Using
 * the shared helper also guarantees key-format parity with the rest of rbac.ts — no more
 * hand-built keys drifting out of sync. */
async function invalidatePermissionCacheForScheme(schemeId: string) {
  const bindings = await prisma.projectRoleSchemeProject.findMany({
    where: { schemeId },
    select: { projectId: true },
  });
  await Promise.all(bindings.map(b => invalidateProjectEffectivePermissions(b.projectId)));
}

const schemeInclude = {
  roles: {
    include: { permissions: true },
    orderBy: { createdAt: 'asc' as const },
  },
  projects: {
    include: { project: { select: { id: true, name: true, key: true } } },
  },
  _count: { select: { roles: true, projects: true } },
};

export async function listSchemes() {
  return prisma.projectRoleScheme.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: schemeInclude,
  });
}

export async function getScheme(id: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id }, include: schemeInclude });
  if (!scheme) throw new AppError(404, 'Схема ролей не найдена');
  return scheme;
}

export async function createScheme(dto: CreateSchemeDto) {
  const created = await prisma.$transaction(async (tx) => {
    // Capture the current default scheme BEFORE clearing its flag — otherwise when dto.isDefault
    // is true the updateMany wipes isDefault from the old default and the bootstrap lookup below
    // can't find any source scheme, producing a new default scheme with no system roles.
    const sourceScheme = await tx.projectRoleScheme.findFirst({
      where: { isDefault: true },
      include: { roles: { include: { permissions: true } } },
    });
    // Require a default scheme to exist — createScheme clones system roles from it. Without a
    // source the new scheme would be unusable (no ADMIN/MANAGER/USER/VIEWER, attachProject 400s).
    // Run `prisma db seed` to initialize the default scheme.
    if (!sourceScheme) {
      throw new AppError(500, 'Не настроена дефолтная схема ролей — запустите seed для инициализации перед созданием новых схем');
    }
    if (dto.isDefault) {
      await tx.projectRoleScheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    const scheme = await tx.projectRoleScheme.create({ data: dto });
    // Bootstrap the 4 system roles with permissions cloned from the previous default scheme.
    for (const srcRole of sourceScheme.roles.filter(r => r.isSystem)) {
      const dstRole = await tx.projectRoleDefinition.create({
        data: {
          schemeId: scheme.id,
          name: srcRole.name,
          key: srcRole.key,
          description: srcRole.description,
          color: srcRole.color,
          isSystem: true,
        },
      });
      const grantedPerms = srcRole.permissions.filter(p => p.granted);
      if (grantedPerms.length > 0) {
        await tx.projectRolePermission.createMany({
          data: grantedPerms.map(p => ({ roleId: dstRole.id, permission: p.permission, granted: true })),
        });
      }
    }
    return tx.projectRoleScheme.findUniqueOrThrow({ where: { id: scheme.id }, include: schemeInclude });
  });
  if (dto.isDefault) {
    // Unbound projects fall back to the default scheme via getSchemeForProject. When the default
    // itself changes, every cached PROJECT_SCHEME_KEY is potentially stale.
    await delCacheByPrefix('rbac:project:');
  }
  return created;
}

export async function updateScheme(id: string, dto: UpdateSchemeDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id } });
  if (!scheme) throw new AppError(404, 'Схема ролей не найдена');
  // Protect the "at least one default scheme" invariant — getSchemeForProject and detachProject
  // both assume one exists and fail with 500 otherwise. Only block the unset if this IS the last
  // default scheme; if another default already exists (edge case or cleanup), allow it.
  if (scheme.isDefault && dto.isDefault === false) {
    const otherDefaultCount = await prisma.projectRoleScheme.count({
      where: { isDefault: true, id: { not: id } },
    });
    if (otherDefaultCount === 0) {
      throw new AppError(400, 'Нельзя снять флаг isDefault у единственной дефолтной схемы — назначьте дефолтной другую схему');
    }
  }
  const defaultChanged = dto.isDefault === true && !scheme.isDefault;
  const updated = await prisma.$transaction(async (tx) => {
    if (dto.isDefault === true) {
      await tx.projectRoleScheme.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.projectRoleScheme.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
      include: schemeInclude,
    });
  });
  await invalidateSchemeCache(id);
  if (defaultChanged) {
    await delCacheByPrefix('rbac:project:');
  }
  return updated;
}

export async function deleteScheme(id: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  if (!scheme) throw new AppError(404, 'Схема ролей не найдена');
  if (scheme.isDefault) throw new AppError(400, 'Нельзя удалить дефолтную схему');
  if (scheme._count.projects > 0) throw new AppError(400, 'SCHEME_IN_USE');
  // Invalidate BEFORE delete — otherwise any bindings are already gone (cascade) and we cannot
  // resolve the list of projectIds whose cache still holds a reference to this scheme.
  await invalidateSchemeCache(id);
  await invalidatePermissionCacheForScheme(id);
  await prisma.projectRoleScheme.delete({ where: { id } });
  return { ok: true };
}

/**
 * Remap all UserProjectRole rows of a project to the target scheme by matching the SOURCE role
 * key (from the joined ProjectRoleDefinition if roleId is set, else the legacy `role` enum).
 * This preserves custom role identity across scheme switches — e.g. a "DEVOPS" role in the
 * previous scheme maps to a "DEVOPS" role in the target scheme, not to the USER role that its
 * legacy enum column happened to be mapped to.
 *
 * Rejects the whole operation with 400 if any source key is missing in the target scheme.
 * Must be called inside a transaction so the composite FK stays consistent.
 */
async function remapProjectUserRolesToScheme(
  tx: Prisma.TransactionClient,
  projectId: string,
  targetSchemeId: string,
) {
  const targetRoles = await tx.projectRoleDefinition.findMany({
    where: { schemeId: targetSchemeId },
    select: { id: true, key: true },
  });
  const keyToId = new Map(targetRoles.map(r => [r.key, r.id]));

  const rows = await tx.userProjectRole.findMany({
    where: { projectId },
    select: {
      id: true,
      role: true,
      roleDefinition: { select: { key: true } }, // source scheme's role key (if roleId is set)
    },
  });

  // For each row: prefer the source role's key (custom-role-aware); fall back to legacy `role`
  // for rows that never got a roleId. A row's target is determined by this key alone.
  const rowKey = (r: (typeof rows)[number]): string => r.roleDefinition?.key ?? (r.role as string);
  const unmapped = Array.from(new Set(rows.map(rowKey).filter(key => !keyToId.has(key))));
  if (unmapped.length > 0) {
    throw new AppError(
      400,
      `В целевой схеме нет ролей с ключами: ${unmapped.join(', ')}. Добавьте эти роли в схему или переназначьте пользователей перед сменой схемы.`,
    );
  }

  // Batch updates by target role: collect row ids per key, issue one updateMany per distinct key.
  const idsByKey = new Map<string, string[]>();
  for (const r of rows) {
    const key = rowKey(r);
    const bucket = idsByKey.get(key) ?? [];
    bucket.push(r.id);
    idsByKey.set(key, bucket);
  }
  for (const [key, ids] of idsByKey) {
    const newRoleId = keyToId.get(key)!;
    await tx.userProjectRole.updateMany({
      where: { id: { in: ids } },
      data: { roleId: newRoleId, schemeId: targetSchemeId },
    });
  }
}

export async function attachProject(schemeId: string, projectId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Схема ролей не найдена');
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Проект не найден');

  const { binding, created, changed } = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectRoleSchemeProject.findUnique({ where: { projectId } });
    // Idempotent re-attach to the same scheme: no data changes → skip remap and return early.
    // Saves a findMany + updateMany per distinct source key on large projects.
    if (existing?.schemeId === schemeId) {
      return { binding: existing, created: false, changed: false };
    }
    await remapProjectUserRolesToScheme(tx, projectId, schemeId);
    const binding = await tx.projectRoleSchemeProject.upsert({
      where: { projectId },
      update: { schemeId },
      create: { schemeId, projectId },
    });
    return { binding, created: !existing, changed: true };
  });

  if (changed) {
    await delCachedJson(PROJECT_SCHEME_KEY(projectId));
    await delCacheByPrefix(`rbac:perm:${projectId}:`);
  }
  return { binding, created };
}

export async function detachProject(schemeId: string, projectId: string) {
  await prisma.$transaction(async (tx) => {
    const binding = await tx.projectRoleSchemeProject.findFirst({ where: { schemeId, projectId } });
    if (!binding) throw new AppError(404, 'Проект не привязан к этой схеме');
    // After detach the project falls back to the default scheme. A default scheme is a system
    // invariant; without one we would leave UserProjectRole rows pointing at the now-unrelated
    // previous scheme and getSchemeForProject would already be broken. Fail fast instead.
    const defaultScheme = await tx.projectRoleScheme.findFirst({ where: { isDefault: true }, select: { id: true } });
    if (!defaultScheme) throw new AppError(500, 'Не настроена дефолтная схема ролей');
    await tx.projectRoleSchemeProject.delete({ where: { projectId } });
    await remapProjectUserRolesToScheme(tx, projectId, defaultScheme.id);
  });
  await delCachedJson(PROJECT_SCHEME_KEY(projectId));
  await delCacheByPrefix(`rbac:perm:${projectId}:`);
  return { ok: true };
}

export async function getSchemeForProject(projectId: string) {
  const cached = await getCachedJson<Awaited<ReturnType<typeof getScheme>>>(PROJECT_SCHEME_KEY(projectId));
  if (cached) return cached;

  // Validate project exists before returning any scheme (the default) — otherwise the public
  // /api/projects/:projectId/role-scheme endpoint would silently answer for arbitrary UUIDs
  // and the permission cache would accumulate entries for non-existent projects.
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new AppError(404, 'Проект не найден');

  const binding = await prisma.projectRoleSchemeProject.findUnique({
    where: { projectId },
    include: { scheme: { include: schemeInclude } },
  });
  if (binding) {
    await setCachedJson(PROJECT_SCHEME_KEY(projectId), binding.scheme, 300);
    return binding.scheme;
  }

  const defaultScheme = await prisma.projectRoleScheme.findFirst({
    where: { isDefault: true },
    include: schemeInclude,
  });
  if (!defaultScheme) throw new AppError(500, 'Не настроена дефолтная схема ролей');
  await setCachedJson(PROJECT_SCHEME_KEY(projectId), defaultScheme, 300);
  return defaultScheme;
}

export async function listRoles(schemeId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Схема ролей не найдена');
  return prisma.projectRoleDefinition.findMany({
    where: { schemeId },
    include: { permissions: true, _count: { select: { userProjectRoles: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createRole(schemeId: string, dto: CreateRoleDefinitionDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Схема ролей не найдена');
  // Reserved keys: custom (non-system) roles must not shadow system-role keys, otherwise
  // assignProjectRole's legacy fallback and remapProjectUserRolesToScheme's key-based lookup
  // become ambiguous. System roles with these keys are created internally (isSystem: true)
  // by the seed.
  if ((Object.values(ProjectRole) as string[]).includes(dto.key)) {
    throw new AppError(400, `Ключ "${dto.key}" зарезервирован за системной ролью`);
  }
  const existing = await prisma.projectRoleDefinition.findUnique({
    where: { schemeId_key: { schemeId, key: dto.key } },
  });
  if (existing) throw new AppError(409, `Роль с ключом "${dto.key}" уже существует в этой схеме`);
  const role = await prisma.projectRoleDefinition.create({
    data: { ...dto, schemeId, isSystem: false },
    include: { permissions: true },
  });
  await invalidateSchemeCache(schemeId);
  await invalidatePermissionCacheForScheme(schemeId);
  return role;
}

export async function updateRole(schemeId: string, roleId: string, dto: UpdateRoleDefinitionDto) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Роль не найдена');
  const updated = await prisma.projectRoleDefinition.update({
    where: { id: roleId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.color !== undefined && { color: dto.color }),
    },
    include: { permissions: true },
  });
  await invalidateSchemeCache(schemeId);
  await invalidatePermissionCacheForScheme(schemeId);
  return updated;
}

export async function deleteRole(schemeId: string, roleId: string) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Роль не найдена');
  if (role.isSystem) throw new AppError(400, 'Нельзя удалить системную роль');
  const usageCount = await prisma.userProjectRole.count({ where: { roleId } });
  if (usageCount > 0) throw new AppError(400, `ROLE_IN_USE: роль назначена ${usageCount} пользователям`);
  await prisma.projectRoleDefinition.delete({ where: { id: roleId } });
  await invalidateSchemeCache(schemeId);
  await invalidatePermissionCacheForScheme(schemeId);
  return { ok: true };
}

export async function getPermissions(schemeId: string, roleId: string) {
  const role = await prisma.projectRoleDefinition.findFirst({
    where: { id: roleId, schemeId },
    include: { permissions: true },
  });
  if (!role) throw new AppError(404, 'Роль не найдена');
  return role.permissions;
}

export async function updatePermissions(schemeId: string, roleId: string, dto: UpdatePermissionsDto) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Роль не найдена');
  // Replace only the keys present in dto.permissions (partial update semantics).
  // Use deleteMany + createMany inside a transaction: 2 queries regardless of matrix size.
  // Store only `granted: true` rows; absence of a row means "not granted" — this keeps the
  // permissions table compact and makes reads/caches cheaper.
  const entries = Object.entries(dto.permissions) as [ProjectPermission, boolean][];
  const keys = entries.map(([p]) => p);
  const grantedEntries = entries.filter(([, granted]) => granted);
  const result = await prisma.$transaction(async (tx) => {
    if (keys.length > 0) {
      await tx.projectRolePermission.deleteMany({ where: { roleId, permission: { in: keys } } });
      if (grantedEntries.length > 0) {
        await tx.projectRolePermission.createMany({
          data: grantedEntries.map(([permission, granted]) => ({ roleId, permission, granted })),
        });
      }
    }
    return tx.projectRoleDefinition.findUniqueOrThrow({
      where: { id: roleId },
      include: { permissions: true },
    });
  });
  await invalidateSchemeCache(schemeId);
  await invalidatePermissionCacheForScheme(schemeId);
  return result;
}
