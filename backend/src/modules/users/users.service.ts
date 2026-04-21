import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { isSuperAdmin } from '../../shared/auth/roles.js';
import type { SystemRoleType } from '@prisma/client';
import type { UpdatePreferencesDto, UpdateUserDto } from './users.dto.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  systemRoles: { select: { role: true } },
};

function formatUser(raw: { systemRoles: { role: SystemRoleType }[]; [key: string]: unknown }) {
  const { systemRoles, ...rest } = raw;
  return { ...rest, systemRoles: systemRoles.map((sr) => sr.role) };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    where: { isSystem: false, isActive: true },
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
  return users.map(formatUser);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new AppError(404, 'User not found');
  return formatUser(user);
}

export async function updateUser(id: string, dto: UpdateUserDto) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  if (dto.email) {
    dto.email = dto.email.trim().toLowerCase();
    if (dto.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new AppError(409, 'Email already in use');
    }
  }

  const updated = await prisma.user.update({ where: { id }, data: dto, select: userSelect });
  return formatUser(updated);
}

type RoleChangeActor = {
  userId: string;
  systemRoles: SystemRoleType[];
};

/**
 * Set the complete list of system roles for a user.
 * - Only SUPER_ADMIN can assign/remove SUPER_ADMIN or ADMIN roles.
 * - USER role cannot be removed (it's the mandatory base role).
 * - Exactly the provided set of roles will be stored.
 */
export async function setSystemRoles(actor: RoleChangeActor, targetId: string, roles: SystemRoleType[]) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, systemRoles: { select: { role: true } } },
  });
  if (!target) throw new AppError(404, 'User not found');

  const actorIsSuperAdmin = isSuperAdmin(actor.systemRoles);
  const targetCurrentRoles = target.systemRoles.map((sr) => sr.role);

  // Guard: only SUPER_ADMIN can assign/remove SUPER_ADMIN or ADMIN
  if (!actorIsSuperAdmin) {
    if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) {
      throw new AppError(403, 'Only super admins can assign SUPER_ADMIN or ADMIN');
    }
    if (targetCurrentRoles.includes('SUPER_ADMIN') || targetCurrentRoles.includes('ADMIN')) {
      throw new AppError(403, 'Only super admins can manage SUPER_ADMIN or ADMIN users');
    }
  }

  // Guard: a SUPER_ADMIN cannot remove their own SUPER_ADMIN role
  if (actor.userId === targetId && actor.systemRoles.includes('SUPER_ADMIN') && !roles.includes('SUPER_ADMIN')) {
    throw new AppError(403, 'Super admin cannot remove their own SUPER_ADMIN role');
  }

  // Guard: USER role is mandatory
  if (!roles.includes('USER')) {
    throw new AppError(400, 'USER role is mandatory and cannot be removed');
  }

  // Reconcile: delete removed roles, create added roles
  const toDelete = targetCurrentRoles.filter((r) => !roles.includes(r));
  const toAdd = roles.filter((r) => !targetCurrentRoles.includes(r));

  await prisma.$transaction([
    ...toDelete.map((r) =>
      prisma.userSystemRole.delete({ where: { userId_role: { userId: targetId, role: r } } }),
    ),
    ...toAdd.map((r) =>
      prisma.userSystemRole.create({ data: { userId: targetId, role: r, createdBy: actor.userId } }),
    ),
  ]);

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: targetId },
    select: userSelect,
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.system_roles_set',
      entityType: 'user',
      entityId: targetId,
      userId: actor.userId,
      details: { added: toAdd, removed: toDelete, result: roles },
    },
  });

  return formatUser(updated);
}

/**
 * Add a single system role to a user.
 */
export async function addSystemRole(actor: RoleChangeActor, targetId: string, role: SystemRoleType) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, systemRoles: { select: { role: true } } },
  });
  if (!target) throw new AppError(404, 'User not found');

  const actorIsSuperAdmin = isSuperAdmin(actor.systemRoles);
  const targetCurrentRoles = target.systemRoles.map((sr) => sr.role);

  if (!actorIsSuperAdmin) {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      throw new AppError(403, 'Only super admins can assign SUPER_ADMIN or ADMIN');
    }
    if (targetCurrentRoles.includes('SUPER_ADMIN') || targetCurrentRoles.includes('ADMIN')) {
      throw new AppError(403, 'Only super admins can manage SUPER_ADMIN or ADMIN users');
    }
  }

  if (targetCurrentRoles.includes(role)) {
    throw new AppError(409, 'Role already assigned');
  }

  await prisma.userSystemRole.create({
    data: { userId: targetId, role, createdBy: actor.userId },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.system_role_added',
      entityType: 'user',
      entityId: targetId,
      userId: actor.userId,
      details: { role },
    },
  });

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: targetId },
    select: { systemRoles: { select: { role: true } } },
  });
  return updated.systemRoles.map((sr) => sr.role);
}

/**
 * Remove a single system role from a user.
 * USER role cannot be removed.
 */
export async function removeSystemRole(actor: RoleChangeActor, targetId: string, role: SystemRoleType) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, systemRoles: { select: { role: true } } },
  });
  if (!target) throw new AppError(404, 'User not found');

  const actorIsSuperAdmin = isSuperAdmin(actor.systemRoles);
  const targetCurrentRoles = target.systemRoles.map((sr) => sr.role);

  if (role === 'USER') {
    throw new AppError(400, 'USER role is mandatory and cannot be removed. Use deactivation instead.');
  }

  if (!actorIsSuperAdmin) {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      throw new AppError(403, 'Only super admins can remove SUPER_ADMIN or ADMIN');
    }
    if (targetCurrentRoles.includes('SUPER_ADMIN') || targetCurrentRoles.includes('ADMIN')) {
      throw new AppError(403, 'Only super admins can manage SUPER_ADMIN or ADMIN users');
    }
  }

  if (actor.userId === targetId && role === 'SUPER_ADMIN') {
    throw new AppError(403, 'Super admin cannot remove their own SUPER_ADMIN role');
  }

  if (!targetCurrentRoles.includes(role)) {
    throw new AppError(404, 'User does not have the specified role');
  }

  await prisma.userSystemRole.delete({ where: { userId_role: { userId: targetId, role } } });

  await prisma.auditLog.create({
    data: {
      action: 'user.system_role_removed',
      entityType: 'user',
      entityId: targetId,
      userId: actor.userId,
      details: { role },
    },
  });
}

export async function getSystemRoles(userId: string): Promise<SystemRoleType[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRoles: { select: { role: true } } },
  });
  if (!user) throw new AppError(404, 'User not found');
  return user.systemRoles.map((sr) => sr.role);
}

const NA_SUFFIX = ' (N/A)';
const MAX_NAME_LEN = 255;

// TTSRH-1 PR-7: per-user preferences — read/merge semantics.
// Merge is shallow over top-level keys (`searchDefaults`, …) and replace within; this matches
// TTUI-90 §5.4. PATCH with partial payload only overwrites the keys provided.
export async function getPreferences(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  if (!user) throw new AppError(404, 'User not found');
  return (user.preferences as Record<string, unknown> | null) ?? {};
}

export async function updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<Record<string, unknown>> {
  const existing = await getPreferences(userId);
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(dto)) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: merged as never },
  });
  return merged;
}

export async function deactivateUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  let newName = user.name;
  if (!newName.endsWith(NA_SUFFIX)) {
    const base = newName.length + NA_SUFFIX.length > MAX_NAME_LEN
      ? newName.slice(0, MAX_NAME_LEN - NA_SUFFIX.length)
      : newName;
    newName = base + NA_SUFFIX;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false, name: newName },
    select: userSelect,
  });
  return formatUser(updated);
}
