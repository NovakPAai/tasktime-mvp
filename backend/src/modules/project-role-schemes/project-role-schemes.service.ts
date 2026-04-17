import type { Prisma, ProjectPermission } from '@prisma/client';
import { ProjectRole } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson, delCacheByPrefix } from '../../shared/redis.js';
import type {
  CreateSchemeDto,
  UpdateSchemeDto,
  CreateRoleDefinitionDto,
  UpdateRoleDefinitionDto,
  UpdatePermissionsDto,
} from './project-role-schemes.dto.js';

const SCHEME_CACHE_KEY = (schemeId: string) => `rbac:scheme:${schemeId}:roles`;
const PROJECT_SCHEME_KEY = (projectId: string) => `rbac:project:${projectId}:scheme`;

async function invalidateSchemeCache(schemeId: string) {
  await delCachedJson(SCHEME_CACHE_KEY(schemeId));
  const bindings = await prisma.projectRoleSchemeProject.findMany({
    where: { schemeId },
    select: { projectId: true },
  });
  await Promise.all(bindings.map(b => delCachedJson(PROJECT_SCHEME_KEY(b.projectId))));
}

/** Invalidate per-user permission cache for all projects bound to a scheme.
 * Call after any change that affects permission resolution (permissions matrix, role membership). */
async function invalidatePermissionCacheForScheme(schemeId: string) {
  const bindings = await prisma.projectRoleSchemeProject.findMany({
    where: { schemeId },
    select: { projectId: true },
  });
  await Promise.all(bindings.map(b => delCacheByPrefix(`rbac:perm:${b.projectId}:`)));
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
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  return scheme;
}

export async function createScheme(dto: CreateSchemeDto) {
  return prisma.$transaction(async (tx) => {
    if (dto.isDefault) {
      await tx.projectRoleScheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.projectRoleScheme.create({ data: dto, include: schemeInclude });
  });
}

export async function updateScheme(id: string, dto: UpdateSchemeDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
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
  return updated;
}

export async function deleteScheme(id: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  if (scheme.isDefault) throw new AppError(400, 'Cannot delete the default scheme');
  if (scheme._count.projects > 0) throw new AppError(400, 'SCHEME_IN_USE');
  await prisma.projectRoleScheme.delete({ where: { id } });
  await invalidateSchemeCache(id);
  return { ok: true };
}

/**
 * Remap all UserProjectRole rows of a project to the target scheme by matching the legacy `role`
 * enum to a role key in that scheme. Rows whose key has no match are reset to (roleId=NULL,
 * schemeId=NULL); requireProjectPermission falls back to the legacy `role` enum for those.
 *
 * Batched: 4 `updateMany` queries — one per legacy enum value (ADMIN, MANAGER, USER, VIEWER).
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
  for (const key of Object.values(ProjectRole)) {
    const roleId = keyToId.get(key);
    await tx.userProjectRole.updateMany({
      where: { projectId, role: key },
      data: roleId ? { roleId, schemeId: targetSchemeId } : { roleId: null, schemeId: null },
    });
  }
}

export async function attachProject(schemeId: string, projectId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const { binding, created } = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectRoleSchemeProject.findUnique({ where: { projectId } });
    await remapProjectUserRolesToScheme(tx, projectId, schemeId);
    const binding = await tx.projectRoleSchemeProject.upsert({
      where: { projectId },
      update: { schemeId },
      create: { schemeId, projectId },
    });
    return { binding, created: !existing };
  });

  await delCachedJson(PROJECT_SCHEME_KEY(projectId));
  await delCacheByPrefix(`rbac:perm:${projectId}:`);
  return { binding, created };
}

export async function detachProject(schemeId: string, projectId: string) {
  await prisma.$transaction(async (tx) => {
    const binding = await tx.projectRoleSchemeProject.findFirst({ where: { schemeId, projectId } });
    if (!binding) throw new AppError(404, 'Project not attached to this scheme');
    // After detach the project falls back to the default scheme. A default scheme is a system
    // invariant; without one we would leave UserProjectRole rows pointing at the now-unrelated
    // previous scheme and getSchemeForProject would already be broken. Fail fast instead.
    const defaultScheme = await tx.projectRoleScheme.findFirst({ where: { isDefault: true }, select: { id: true } });
    if (!defaultScheme) throw new AppError(500, 'No default role scheme configured');
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
  if (!project) throw new AppError(404, 'Project not found');

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
  if (!defaultScheme) throw new AppError(500, 'No default role scheme configured');
  await setCachedJson(PROJECT_SCHEME_KEY(projectId), defaultScheme, 300);
  return defaultScheme;
}

export async function listRoles(schemeId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  return prisma.projectRoleDefinition.findMany({
    where: { schemeId },
    include: { permissions: true, _count: { select: { userProjectRoles: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createRole(schemeId: string, dto: CreateRoleDefinitionDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const existing = await prisma.projectRoleDefinition.findUnique({
    where: { schemeId_key: { schemeId, key: dto.key } },
  });
  if (existing) throw new AppError(409, `Role with key "${dto.key}" already exists in this scheme`);
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
  if (!role) throw new AppError(404, 'Role not found');
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
  if (!role) throw new AppError(404, 'Role not found');
  if (role.isSystem) throw new AppError(400, 'Cannot delete a system role');
  const usageCount = await prisma.userProjectRole.count({ where: { roleId } });
  if (usageCount > 0) throw new AppError(400, `ROLE_IN_USE: ${usageCount} users have this role`);
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
  if (!role) throw new AppError(404, 'Role not found');
  return role.permissions;
}

export async function updatePermissions(schemeId: string, roleId: string, dto: UpdatePermissionsDto) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Role not found');
  // Replace only the keys present in dto.permissions (partial update semantics).
  // Use deleteMany + createMany inside a transaction instead of N per-permission upsert: 2 queries
  // total regardless of matrix size.
  const entries = Object.entries(dto.permissions) as [ProjectPermission, boolean][];
  const keys = entries.map(([p]) => p);
  const result = await prisma.$transaction(async (tx) => {
    if (keys.length > 0) {
      await tx.projectRolePermission.deleteMany({ where: { roleId, permission: { in: keys } } });
      await tx.projectRolePermission.createMany({
        data: entries.map(([permission, granted]) => ({ roleId, permission, granted })),
      });
    }
    return tx.projectRoleDefinition.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
  });
  await invalidateSchemeCache(schemeId);
  await invalidatePermissionCacheForScheme(schemeId);
  return result;
}
