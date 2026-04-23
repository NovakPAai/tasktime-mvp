import type { SystemRoleType } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../redis.js';

export function hasSystemRole(userRoles: SystemRoleType[], requiredRole: SystemRoleType): boolean {
  return userRoles.includes('SUPER_ADMIN') || userRoles.includes(requiredRole);
}

export function hasAnySystemRole(userRoles: SystemRoleType[], requiredRoles: readonly SystemRoleType[]): boolean {
  return requiredRoles.some((role) => hasSystemRole(userRoles, role));
}

export function isSuperAdmin(userRoles: SystemRoleType[]): boolean {
  return userRoles.includes('SUPER_ADMIN');
}

/** Returns true if the user has global read access to all projects. */
export function hasGlobalProjectReadAccess(userRoles: SystemRoleType[]): boolean {
  return hasAnySystemRole(userRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR']);
}

// ---------- TTBULK-1 PR-2: effective system roles (DIRECT ∪ GROUP) ----------
//
// Эффективные системные роли юзера = объединение прямых назначений
// (`UserSystemRole`, source=DIRECT) и групповых (`UserGroupSystemRole` через
// членство в `UserGroupMember`). JWT-выпуск при login снапшотит DIRECT-роли
// в payload; `authenticate` middleware перезапрашивает эффективные роли через
// эту функцию с Redis-TTL кэшем, чтобы grant через группу срабатывал в пределах
// 60с без переавторизации (см. §5.5 TZ).

const SYSROLES_CACHE_PREFIX = 'user:sysroles:';
const SYSROLES_CACHE_TTL_SECONDS = 60;

export function sysRolesCacheKey(userId: string): string {
  return `${SYSROLES_CACHE_PREFIX}${userId}`;
}

/**
 * Вычисляет эффективные системные роли = UNION(DIRECT, GROUP). Не кэширует.
 * Используется `getEffectiveUserSystemRoles` и тестами.
 */
export async function computeEffectiveUserSystemRoles(userId: string): Promise<SystemRoleType[]> {
  const [direct, viaGroups] = await Promise.all([
    prisma.userSystemRole.findMany({ where: { userId }, select: { role: true } }),
    prisma.userGroupSystemRole.findMany({
      where: { group: { members: { some: { userId } } } },
      select: { role: true },
    }),
  ]);
  return Array.from(
    new Set<SystemRoleType>([...direct.map((x) => x.role), ...viaGroups.map((x) => x.role)]),
  );
}

/**
 * Returns эффективные системные роли юзера = UNION(DIRECT ∪ GROUP), с Redis TTL-кэшем 60с.
 *
 * При недоступности Redis — fallback на прямой запрос БД (graceful degradation,
 * `getCachedJson` возвращает null). Кэш инвалидируется через
 * `invalidateUserSystemRolesCache(userId)` из users.service / user-groups.service
 * при изменении assignments.
 */
export async function getEffectiveUserSystemRoles(userId: string): Promise<SystemRoleType[]> {
  const cached = await getCachedJson<SystemRoleType[]>(sysRolesCacheKey(userId));
  if (cached !== null) return cached;

  const merged = await computeEffectiveUserSystemRoles(userId);
  await setCachedJson(sysRolesCacheKey(userId), merged, SYSROLES_CACHE_TTL_SECONDS);
  return merged;
}

/**
 * Инвалидация кэша эффективных системных ролей юзера. Вызывается при любом
 * изменении, влияющем на эффективные роли:
 *   • `UserSystemRole` добавлена/удалена (users.service)
 *   • `UserGroupSystemRole` добавлена/удалена (admin endpoint — PR-8)
 *   • членство в группе изменилось (user-groups.service)
 */
export async function invalidateUserSystemRolesCache(userId: string): Promise<void> {
  await delCachedJson(sysRolesCacheKey(userId));
}

/**
 * Bulk-инвалидация: вызывается когда `UserGroupSystemRole` меняется, и это
 * затрагивает всех членов группы (их эффективные роли могут измениться).
 * Используется в PR-8 admin endpoint'ах.
 */
export async function invalidateUserSystemRolesCacheForUsers(userIds: string[]): Promise<void> {
  await Promise.all(userIds.map((id) => invalidateUserSystemRolesCache(id)));
}
