/**
 * TTBULK-1 — Сервисный слой для массовых операций.
 *
 * Публичный API (см. §4 ТЗ):
 *   • previewBulkOperation(ctx) — резолвит scope → issueIds, делает dry-run
 *     (per-item preflight через executor-stubs в PR-3; реальные executors — PR-5),
 *     возвращает разделение на eligible/skipped/conflicts + previewToken
 *     (Redis 15 мин). Silent-truncate при totalMatched > maxItems для scope=jql.
 *
 *   • createBulkOperation(ctx) — валидирует previewToken (owner + срок жизни),
 *     создаёт `BulkOperation` в БД, RPUSH issueIds в Redis pending-queue
 *     `bulk-op:{id}:pending`, возвращает { id, status: 'QUEUED' }. Проверяет
 *     concurrency-quota (max N активных на юзера, из System settings PR-7
 *     или ENV-default).
 *
 *   • getBulkOperation(id, actor) — 404 если не владелец.
 *
 *   • cancelBulkOperation(id, actor) — UPDATE cancel_requested=true; processor
 *     (PR-4) проверяет флаг между пачками и финализирует в CANCELLED.
 *
 *   • listBulkOperations(actor, query) — список моих операций с пагинацией.
 *
 * Инварианты:
 *   • previewToken хранится в Redis как JSON с `{userId, type, payload,
 *     issueIds, warnings}`; TTL 15 мин. При expire — 409 PREVIEW_EXPIRED.
 *   • Executor-stubs в PR-3 возвращают ELIGIBLE для всех items. В PR-4/5 —
 *     реальные преflight-матрицы.
 *   • Idempotency — `@@unique([createdById, idempotencyKey])`; дубликат
 *     возвращает существующий BulkOperation.id (200 вместо 201).
 *   • RBAC: `BULK_OPERATOR` системная (в router'е через requireRole).
 *     Per-item проверки (NO_ACCESS, ISSUE_DELETE) — в executor'ах PR-5.
 *   • pending-queue живёт только в Redis (§5.0). Если Redis down на
 *     createBulkOperation — 503 SERVICE_UNAVAILABLE, операция не создаётся
 *     (без queue processor её не увидит).
 *
 * См. docs/tz/TTBULK-1.md §4-§6.
 */

import type { BulkOperation, BulkOperationStatus, BulkOperationType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { isUniqueViolation } from '../../shared/utils/prisma-errors.js';
import {
  setCachedJson,
  atomicGetDelJson,
  rpushList,
  isRedisAvailable,
} from '../../shared/redis.js';
import { searchIssues } from '../search/search.service.js';
import type { OperationPayload } from './bulk-operations.dto.js';
import { MAX_ITEMS_HARD_LIMIT } from './bulk-operations.dto.js';
import type { BulkExecutorActor } from './bulk-operations.types.js';

// ────── Константы / конфигурация ─────────────────────────────────────────────

/** TTL preview-токена в Redis. Пользователь обязан подтвердить submit до истечения. */
const PREVIEW_TOKEN_TTL_SECONDS = Number(process.env.BULK_OP_PREVIEW_TTL_SECONDS ?? 15 * 60);

/** Default concurrency quota per user (runtime может переопределить в PR-7 через System settings). */
const DEFAULT_MAX_CONCURRENT_PER_USER = Number(process.env.BULK_OP_MAX_CONCURRENT_PER_USER ?? 3);

/** Hard-cap on items per operation (DTO уже clamp'ит на 10k; SystemSettings (PR-7) может <= этого). */
const DEFAULT_MAX_ITEMS = Number(process.env.BULK_OP_MAX_ITEMS ?? MAX_ITEMS_HARD_LIMIT);

const PREVIEW_KEY_PREFIX = 'bulk-op:preview:';
const PENDING_KEY_PREFIX = 'bulk-op:';
const PENDING_KEY_SUFFIX = ':pending';

/** @internal — exported для тестов и для PR-4 processor'а (LPOP). */
export function previewTokenKey(token: string): string {
  return `${PREVIEW_KEY_PREFIX}${token}`;
}
/** @internal — exported для тестов и для PR-4 processor'а. */
export function pendingQueueKey(operationId: string): string {
  return `${PENDING_KEY_PREFIX}${operationId}${PENDING_KEY_SUFFIX}`;
}

// ────── Types ────────────────────────────────────────────────────────────────

export type BulkExecutorContext = BulkExecutorActor & {
  accessibleProjectIds: readonly string[];
};

export type EligibleItem = {
  issueId: string;
  issueKey: string;
  title: string;
  projectId: string;
  projectKey: string;
  preview?: Record<string, unknown>;
};

export type SkippedItem = {
  issueId: string;
  issueKey: string;
  title: string;
  reasonCode: string;
  reason: string;
};

export type ConflictItem = {
  issueId: string;
  issueKey: string;
  title: string;
  code: string;
  message: string;
  requiredFields?: string[];
};

export type PreviewResponse = {
  previewToken: string;
  totalMatched: number;
  eligible: EligibleItem[];
  skipped: SkippedItem[];
  conflicts: ConflictItem[];
  warnings: string[];
};

/** Stored in Redis under `previewTokenKey(token)` for TTL minutes. */
type PreviewCacheEntry = {
  userId: string;
  type: BulkOperationType;
  scopeKind: 'ids' | 'jql';
  scopeJql: string | null;
  payload: OperationPayload;
  /** IDs of items preview marked ELIGIBLE — the ones that will be queued on create. */
  eligibleIds: string[];
  warnings: string[];
};

// ────── preview ──────────────────────────────────────────────────────────────

export async function previewBulkOperation(
  input: { scope: { kind: 'ids'; issueIds: string[] } | { kind: 'jql'; jql: string }; payload: OperationPayload },
  ctx: BulkExecutorContext,
): Promise<PreviewResponse> {
  const { scope, payload } = input;

  // Step 1 — резолвим scope → issueIds.
  const { issueIds, totalMatched, warnings } = await resolveScope(scope, ctx);

  if (issueIds.length === 0) {
    return {
      previewToken: await storePreview({
        userId: ctx.userId,
        type: payload.type,
        scopeKind: scope.kind,
        scopeJql: scope.kind === 'jql' ? scope.jql : null,
        payload,
        eligibleIds: [],
        warnings,
      }),
      totalMatched,
      eligible: [],
      skipped: [],
      conflicts: [],
      warnings,
    };
  }

  // Step 2 — загружаем issue metadata для UI preview.
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds } },
    select: {
      id: true,
      number: true,
      title: true,
      projectId: true,
      project: { select: { id: true, key: true } },
    },
  });
  const issueByIdMap = new Map(issues.map((i) => [i.id, i]));

  // Step 3 — per-item preflight. В PR-3 executor'ы — stub'ы (ELIGIBLE).
  // PR-4/5 добавят реальную per-type preflight-логику; этот цикл при этом не меняется.
  const eligible: EligibleItem[] = [];
  const skipped: SkippedItem[] = [];
  const conflicts: ConflictItem[] = [];

  for (const issueId of issueIds) {
    const issue = issueByIdMap.get(issueId);
    if (!issue) {
      // Задача удалена между разрешением scope и выборкой metadata — SKIPPED.
      skipped.push({
        issueId,
        issueKey: '(deleted)',
        title: '(deleted)',
        reasonCode: 'DELETED',
        reason: 'Задача удалена до начала операции',
      });
      continue;
    }
    const issueKey = `${issue.project.key}-${issue.number}`;
    eligible.push({
      issueId: issue.id,
      issueKey,
      title: issue.title,
      projectId: issue.projectId,
      projectKey: issue.project.key,
    });
  }

  const eligibleIds = eligible.map((e) => e.issueId);

  const previewToken = await storePreview({
    userId: ctx.userId,
    type: payload.type,
    scopeKind: scope.kind,
    scopeJql: scope.kind === 'jql' ? scope.jql : null,
    payload,
    eligibleIds,
    warnings,
  });

  return { previewToken, totalMatched, eligible, skipped, conflicts, warnings };
}

// ────── create ───────────────────────────────────────────────────────────────

export async function createBulkOperation(
  input: { previewToken: string; idempotencyKey: string },
  ctx: BulkExecutorActor,
): Promise<{ id: string; status: BulkOperationStatus; alreadyExisted: boolean }> {
  // Idempotency — если такой ключ уже отправлен, вернуть тот же operationId.
  const existing = await prisma.bulkOperation.findUnique({
    where: { createdById_idempotencyKey: { createdById: ctx.userId, idempotencyKey: input.idempotencyKey } },
    select: { id: true, status: true },
  });
  if (existing) {
    return { id: existing.id, status: existing.status, alreadyExisted: true };
  }

  // Atomic GET+DEL — закрывает double-consume race: две параллельные create-запроса с
  // одним previewToken, но разными idempotencyKey, не смогут обе увидеть данные.
  // После consume токен исчезает из Redis → второй запрос получит 409 PREVIEW_EXPIRED.
  const preview = await atomicGetDelJson<PreviewCacheEntry>(previewTokenKey(input.previewToken));
  if (!preview) {
    throw new AppError(409, 'Preview expired or not found', { code: 'PREVIEW_EXPIRED' });
  }
  if (preview.userId !== ctx.userId) {
    // Чужой previewToken — 404 вместо 403 (чтобы не разглашать существование).
    // Но уже consumed — это последствие atomic GETDEL; владелец получит 409 при следующем
    // submit'е. Приемлемо: попытка кражи токена в любом случае разрушает его валидность.
    throw new AppError(404, 'Preview not found');
  }
  if (preview.eligibleIds.length === 0) {
    throw new AppError(400, 'No eligible items in preview', { code: 'NO_ELIGIBLE_ITEMS' });
  }

  // Concurrency-quota per user.
  const activeCount = await prisma.bulkOperation.count({
    where: {
      createdById: ctx.userId,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
  });
  if (activeCount >= DEFAULT_MAX_CONCURRENT_PER_USER) {
    throw new AppError(429, 'Too many concurrent bulk operations', {
      code: 'TOO_MANY_CONCURRENT',
      retryAfter: 60,
      limit: DEFAULT_MAX_CONCURRENT_PER_USER,
      active: activeCount,
    });
  }

  // Redis должен быть доступен — pending-queue без него не существует.
  if (!(await isRedisAvailable())) {
    throw new AppError(503, 'Backend queue unavailable, try again later', {
      code: 'QUEUE_UNAVAILABLE',
    });
  }

  let operation: { id: string; status: BulkOperationStatus };
  try {
    operation = await prisma.bulkOperation.create({
      data: {
        createdById: ctx.userId,
        type: preview.type,
        status: 'QUEUED',
        scopeKind: preview.scopeKind,
        scopeJql: preview.scopeJql,
        payload: preview.payload as unknown as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        total: preview.eligibleIds.length,
      },
      select: { id: true, status: true },
    });
  } catch (err) {
    // P2002 race: между findUnique(idempotencyKey) и create параллельный запрос
    // с тем же key успел вставить. Re-fetch и вернуть существующий.
    if (isUniqueViolation(err, 'idempotency_key')) {
      const raced = await prisma.bulkOperation.findUnique({
        where: {
          createdById_idempotencyKey: { createdById: ctx.userId, idempotencyKey: input.idempotencyKey },
        },
        select: { id: true, status: true },
      });
      if (raced) {
        return { id: raced.id, status: raced.status, alreadyExisted: true };
      }
    }
    throw err;
  }

  const pushed = await rpushList(pendingQueueKey(operation.id), preview.eligibleIds);
  if (pushed === null) {
    // Redis упал между isRedisAvailable и RPUSH — операция без queue бессмысленна.
    // DELETE (не UPDATE FAILED) — освобождает idempotency-slot, чтобы юзер мог
    // сразу ретраить после восстановления Redis'а.
    await prisma.bulkOperation.delete({ where: { id: operation.id } });
    throw new AppError(503, 'Backend queue unavailable, try again later', {
      code: 'QUEUE_UNAVAILABLE',
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'bulk_operation.created',
      entityType: 'bulk_operation',
      entityId: operation.id,
      userId: ctx.userId,
      bulkOperationId: operation.id,
      details: {
        type: preview.type,
        total: preview.eligibleIds.length,
        scopeKind: preview.scopeKind,
      },
    },
  });

  return { id: operation.id, status: operation.status, alreadyExisted: false };
}

// ────── get ──────────────────────────────────────────────────────────────────

export async function getBulkOperation(
  id: string,
  ctx: BulkExecutorActor,
): Promise<BulkOperation> {
  const op = await prisma.bulkOperation.findUnique({ where: { id } });
  // 404 на чужую, чтобы не разглашать существование (consistency с preview).
  if (!op || op.createdById !== ctx.userId) {
    throw new AppError(404, 'Bulk operation not found');
  }
  return op;
}

// ────── cancel ───────────────────────────────────────────────────────────────

export async function cancelBulkOperation(
  id: string,
  ctx: BulkExecutorActor,
): Promise<BulkOperation> {
  const op = await prisma.bulkOperation.findUnique({ where: { id } });
  if (!op || op.createdById !== ctx.userId) {
    throw new AppError(404, 'Bulk operation not found');
  }
  if (op.status !== 'QUEUED' && op.status !== 'RUNNING') {
    // Идемпотентно — no-op если уже в терминальном состоянии.
    return op;
  }

  const updated = await prisma.bulkOperation.update({
    where: { id },
    data: { cancelRequested: true },
  });

  await prisma.auditLog.create({
    data: {
      action: 'bulk_operation.cancel_requested',
      entityType: 'bulk_operation',
      entityId: id,
      userId: ctx.userId,
      bulkOperationId: id,
    },
  });

  return updated;
}

// ────── list ─────────────────────────────────────────────────────────────────

export async function listBulkOperations(
  ctx: BulkExecutorActor,
  query: { limit?: number; startAt?: number; status?: BulkOperationStatus; type?: BulkOperationType },
) {
  const where: Prisma.BulkOperationWhereInput = { createdById: ctx.userId };
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;

  const limit = query.limit ?? 25;
  const startAt = query.startAt ?? 0;

  const [items, total] = await Promise.all([
    prisma.bulkOperation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: startAt,
      take: limit,
    }),
    prisma.bulkOperation.count({ where }),
  ]);

  return { items, total, startAt, limit };
}

// ────── helpers ──────────────────────────────────────────────────────────────

async function storePreview(entry: PreviewCacheEntry): Promise<string> {
  const token = randomUUID();
  await setCachedJson(previewTokenKey(token), entry, PREVIEW_TOKEN_TTL_SECONDS);
  return token;
}

async function resolveScope(
  scope: { kind: 'ids'; issueIds: string[] } | { kind: 'jql'; jql: string },
  ctx: BulkExecutorContext,
): Promise<{ issueIds: string[]; totalMatched: number; warnings: string[] }> {
  if (scope.kind === 'ids') {
    // Hard-cap уже применён DTO (MAX_ITEMS_HARD_LIMIT = 10k). Runtime-lim может быть <= этого.
    if (scope.issueIds.length > DEFAULT_MAX_ITEMS) {
      throw new AppError(400, 'Too many items in scope', {
        code: 'TOO_MANY_ITEMS',
        limit: DEFAULT_MAX_ITEMS,
        received: scope.issueIds.length,
      });
    }
    return { issueIds: scope.issueIds, totalMatched: scope.issueIds.length, warnings: [] };
  }

  // scope=jql — резолвим через searchIssues. SearchIssuesContext принимает
  // accessibleProjectIds как единственный authoritative scope (search.service.ts:33).
  //
  // ВАЖНО: search.service clamp'ает limit до 100 (MAX_LIMIT). Поэтому резолв
  // идёт постраничным loop'ом — иначе preview для JQL'я с > 100 матчей молча
  // обрезался бы до 100 (pre-push-reviewer #1 🟠). Каждая страница — отдельный
  // round-trip; на ~10k items это 100 вызовов × ~50ms = ~5с, что терпимо для
  // user-initiated preview. В будущем можно заменить на прямой compile →
  // prisma.findMany(select:{id}) с take=10k (refactor отложен).
  const SEARCH_PAGE_SIZE = 100; // = search.service MAX_LIMIT
  const issueIds: string[] = [];
  let totalMatched = 0;
  let startAt = 0;
  while (issueIds.length < DEFAULT_MAX_ITEMS) {
    const result = await searchIssues(
      { jql: scope.jql, startAt, limit: SEARCH_PAGE_SIZE },
      {
        userId: ctx.userId,
        accessibleProjectIds: ctx.accessibleProjectIds,
        now: new Date(),
      },
    );
    if (result.kind === 'error') {
      throw new AppError(result.status, result.message, { code: result.code });
    }
    totalMatched = result.total;
    for (const i of result.issues) {
      issueIds.push(i.id);
      if (issueIds.length >= DEFAULT_MAX_ITEMS) break;
    }
    if (result.issues.length < SEARCH_PAGE_SIZE) break;
    startAt += SEARCH_PAGE_SIZE;
    // MAX_START_AT в search.service = 10000 — наш loop упирается в тот же лимит.
    if (startAt >= DEFAULT_MAX_ITEMS) break;
  }

  const warnings: string[] = [];
  if (totalMatched > DEFAULT_MAX_ITEMS) {
    warnings.push('TRUNCATED_TO_MAX_ITEMS');
  }

  return { issueIds, totalMatched, warnings };
}
