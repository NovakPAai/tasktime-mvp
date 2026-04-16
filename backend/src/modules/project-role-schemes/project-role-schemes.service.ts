import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';
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
  return prisma.projectRoleScheme.create({ data: dto, include: schemeInclude });
}

export async function updateScheme(id: string, dto: UpdateSchemeDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const updated = await prisma.projectRoleScheme.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
    },
    include: schemeInclude,
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

export async function attachProject(schemeId: string, projectId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');
  const binding = await prisma.projectRoleSchemeProject.upsert({
    where: { projectId },
    update: { schemeId },
    create: { schemeId, projectId },
  });
  await delCachedJson(PROJECT_SCHEME_KEY(projectId));
  return binding;
}

export async function detachProject(schemeId: string, projectId: string) {
  const binding = await prisma.projectRoleSchemeProject.findFirst({ where: { schemeId, projectId } });
  if (!binding) throw new AppError(404, 'Project not attached to this scheme');
  await prisma.projectRoleSchemeProject.delete({ where: { projectId } });
  await delCachedJson(PROJECT_SCHEME_KEY(projectId));
  return { ok: true };
}

export async function getSchemeForProject(projectId: string) {
  const cached = await getCachedJson<Awaited<ReturnType<typeof getScheme>>>(PROJECT_SCHEME_KEY(projectId));
  if (cached) return cached;

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
  const ops = Object.entries(dto.permissions).map(([permission, granted]) =>
    prisma.projectRolePermission.upsert({
      where: { roleId_permission: { roleId, permission: permission as any } },
      update: { granted },
      create: { roleId, permission: permission as any, granted },
    }),
  );
  await prisma.$transaction(ops);
  await invalidateSchemeCache(schemeId);
  return prisma.projectRoleDefinition.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
}
