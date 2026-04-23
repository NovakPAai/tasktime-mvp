/**
 * TTBULK-1 PR-7 — Runtime-настройки массовых операций (System settings).
 *
 * Публичный API (см. §11.1 ТЗ):
 *   • getBulkOpsSettings() — текущие значения { maxConcurrentPerUser, maxItems }
 *     с in-memory + 60s-Redis-кэшем. Никогда не бросает: fallback на ENV/hardcode
 *     при любых ошибках (Redis down / malformed JSON / invalid range).
 *
 *   • setBulkOpsSettings(actorId, patch) — валидирует + upsert в `SystemSetting.key='bulk_operations'`,
 *     инвалидирует кэш (both layers), пишет audit_log. Неизвестные поля игнорируются
 *     на уровне DTO выше (Zod strict в admin.dto).
 *
 * Инварианты:
 *   • maxConcurrentPerUser ∈ [1..20], maxItems ∈ [100..50000]. Clamp на read,
 *     reject на write (400).
 *   • ENV-default = `BULK_OP_MAX_CONCURRENT_PER_USER` / `BULK_OP_MAX_ITEMS`
 *     (обратная совместимость с PR-3..PR-6 значениями).
 *   • Hard-ceiling maxItems ≤ MAX_ITEMS_HARD_LIMIT (10k из DTO) — сохраняем
 *     иначе `issueIds.max` в DTO всё равно обрежет до 10k, создав скрытый
 *     truncate. 50k из ТЗ — только roadmap'овый потолок для расширения DTO;
 *     текущий runtime clamp'ит до MAX_ITEMS_HARD_LIMIT.
 *   • Кэш: 60s Redis TTL + 60s in-memory (per-process). На setBulkOpsSettings
 *     оба инвалидируются синхронно.
 *
 * См. docs/tz/TTBULK-1.md §11.1, §13.6 (PR-7).
 */

import { prisma } from '../../prisma/client.js';
import {
  getCachedJson,
  setCachedJson,
  delCachedJson,
} from '../../shared/redis.js';
import { captureError } from '../../shared/utils/logger.js';
import { MAX_ITEMS_HARD_LIMIT } from './bulk-operations.dto.js';

// ────── Публичные константы (используются DTO и UI) ──────────────────────────

export const BULK_OPS_MAX_CONCURRENT_MIN = 1;
export const BULK_OPS_MAX_CONCURRENT_MAX = 20;
export const BULK_OPS_MAX_ITEMS_MIN = 100;
/**
 * UI и DTO принимают значения до 50000 (roadmap), но runtime clamp'ит до
 * MAX_ITEMS_HARD_LIMIT — иначе Zod `issueIds.max` в DTO всё равно срежет scope.
 */
export const BULK_OPS_MAX_ITEMS_MAX = 50_000;

export const SETTING_KEY = 'bulk_operations';
const CACHE_KEY = 'settings:bulk_operations';
const CACHE_TTL_SECONDS = 60;

const DEFAULT_MAX_CONCURRENT = Number(process.env.BULK_OP_MAX_CONCURRENT_PER_USER ?? 3);
const DEFAULT_MAX_ITEMS = Number(process.env.BULK_OP_MAX_ITEMS ?? MAX_ITEMS_HARD_LIMIT);

export type BulkOpsSettings = {
  maxConcurrentPerUser: number;
  maxItems: number;
};

// ────── In-memory кэш (для hot-path createBulkOperation / resolveScope) ─────

type MemoEntry = { value: BulkOpsSettings; expiresAt: number };
let memo: MemoEntry | null = null;

/** @internal — для тестов. */
export function __resetMemoCache(): void {
  memo = null;
}

// ────── Clamp helpers ────────────────────────────────────────────────────────

function clampConcurrent(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_CONCURRENT;
  const i = Math.trunc(n);
  if (i < BULK_OPS_MAX_CONCURRENT_MIN) return BULK_OPS_MAX_CONCURRENT_MIN;
  if (i > BULK_OPS_MAX_CONCURRENT_MAX) return BULK_OPS_MAX_CONCURRENT_MAX;
  return i;
}

function clampItems(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_ITEMS;
  const i = Math.trunc(n);
  // Runtime ceiling — MAX_ITEMS_HARD_LIMIT, иначе DTO срежет scope молча.
  const ceiling = Math.min(BULK_OPS_MAX_ITEMS_MAX, MAX_ITEMS_HARD_LIMIT);
  if (i < BULK_OPS_MAX_ITEMS_MIN) return BULK_OPS_MAX_ITEMS_MIN;
  if (i > ceiling) return ceiling;
  return i;
}

function envDefaults(): BulkOpsSettings {
  return {
    maxConcurrentPerUser: clampConcurrent(DEFAULT_MAX_CONCURRENT),
    maxItems: clampItems(DEFAULT_MAX_ITEMS),
  };
}

// ────── Public API ───────────────────────────────────────────────────────────

export async function getBulkOpsSettings(): Promise<BulkOpsSettings> {
  const now = Date.now();
  if (memo && memo.expiresAt > now) {
    return memo.value;
  }

  try {
    const cached = await getCachedJson<BulkOpsSettings>(CACHE_KEY);
    if (cached && typeof cached === 'object') {
      const resolved: BulkOpsSettings = {
        maxConcurrentPerUser: clampConcurrent(cached.maxConcurrentPerUser),
        maxItems: clampItems(cached.maxItems),
      };
      memo = { value: resolved, expiresAt: now + CACHE_TTL_SECONDS * 1000 };
      return resolved;
    }
  } catch (err) {
    captureError(err, { fn: 'getBulkOpsSettings.redis' });
  }

  let resolved: BulkOpsSettings;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row) {
      const parsed = parseSettingJson(row.value);
      resolved = {
        maxConcurrentPerUser: clampConcurrent(parsed?.maxConcurrentPerUser ?? DEFAULT_MAX_CONCURRENT),
        maxItems: clampItems(parsed?.maxItems ?? DEFAULT_MAX_ITEMS),
      };
    } else {
      resolved = envDefaults();
    }
  } catch (err) {
    captureError(err, { fn: 'getBulkOpsSettings.prisma' });
    resolved = envDefaults();
  }

  try {
    await setCachedJson(CACHE_KEY, resolved, CACHE_TTL_SECONDS);
  } catch (err) {
    captureError(err, { fn: 'getBulkOpsSettings.setCache' });
  }

  memo = { value: resolved, expiresAt: now + CACHE_TTL_SECONDS * 1000 };
  return resolved;
}

export async function setBulkOpsSettings(
  actorId: string,
  patch: Partial<BulkOpsSettings>,
): Promise<BulkOpsSettings> {
  const current = await getBulkOpsSettings();
  const next: BulkOpsSettings = {
    maxConcurrentPerUser:
      patch.maxConcurrentPerUser !== undefined
        ? clampConcurrent(patch.maxConcurrentPerUser)
        : current.maxConcurrentPerUser,
    maxItems:
      patch.maxItems !== undefined ? clampItems(patch.maxItems) : current.maxItems,
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });

  await prisma.auditLog.create({
    data: {
      action: 'system.bulk_operations_settings_changed',
      entityType: 'system',
      entityId: SETTING_KEY,
      userId: actorId,
      details: { before: current, after: next },
    },
  });

  // Инвалидация — оба слоя синхронно.
  memo = null;
  try {
    await delCachedJson(CACHE_KEY);
  } catch (err) {
    captureError(err, { fn: 'setBulkOpsSettings.delCache' });
  }

  return next;
}

// ────── Internal helpers ─────────────────────────────────────────────────────

function parseSettingJson(raw: string): Partial<BulkOpsSettings> | null {
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === 'object') {
      return j as Partial<BulkOpsSettings>;
    }
    return null;
  } catch {
    return null;
  }
}
