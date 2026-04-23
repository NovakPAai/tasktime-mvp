/**
 * TTBULK-1 — Shared helpers для executor'ов.
 *
 * Выделено после pre-push review'а PR-5 (🟠 + 🔵): 5 из 6 executor'ов
 * дублировали identity-check'и, что создавало drift risk для RBAC-фиксов.
 * Один helper — один исправляемый контракт.
 *
 * См. docs/tz/TTBULK-1.md §7.1.
 */

import { prisma } from '../../../prisma/client.js';
import type { BulkExecutorActor } from '../bulk-operations.types.js';

/**
 * Проверяет доступ актора к проекту для bulk-операций.
 *
 * Bypass-политика (TZ §7.1, строгое чтение):
 *   • **SUPER_ADMIN** — единственная роль с неявным bypass'ом.
 *     "SUPER_ADMIN имеет её автоматически через `hasSystemRole`" — встроено.
 *   • **ADMIN** — НЕ bypass'ает, должен получить `BULK_OPERATOR` явно
 *     (§7.1: "даже ADMIN" её не имеет по умолчанию).
 *   • **RELEASE_MANAGER / AUDITOR** — read-only системные роли. НЕ bypass'ают
 *     никаких write-операций в bulk-executor'ах. AUDITOR документирован как
 *     "Cannot create or modify data" в docs/ENG/access_rights.md.
 *
 * Все остальные роли (включая сам `BULK_OPERATOR`) — требуют явного
 * `UserProjectRole` в проекте задачи.
 */
export async function actorHasProjectAccess(
  actor: BulkExecutorActor,
  projectId: string,
): Promise<boolean> {
  if (actor.systemRoles.includes('SUPER_ADMIN')) return true;
  const membership = await prisma.userProjectRole.findFirst({
    where: { userId: actor.userId, projectId },
    select: { userId: true },
  });
  return membership !== null;
}
