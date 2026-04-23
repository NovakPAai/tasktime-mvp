/**
 * TTBULK-1 PR-4 — Фоновый processor для массовых операций.
 *
 * Три cron-ЗАДАЧИ (см. §6.3, §5.3 TZ; cron-expressions в константах ниже):
 *   1. **tick** (раз в ~5с): берёт одну QUEUED/RUNNING операцию (лок-ом защищён
 *      от мультиинстанс-race'ов), обрабатывает пачку из Redis
 *      `bulk-op:{id}:pending`, пишет счётчики и failed/skipped items в БД,
 *      heartbeat. Завершает tick когда queue пуст или cancel_requested.
 *   2. **recovery** (раз в ~1 мин): операция с `status='RUNNING'` +
 *      `heartbeat_at < now - RECOVERY_STALE_SECONDS` сбрасывается в QUEUED.
 *      Покрывает kill -9 инстанса посреди выполнения (следующий tick подхватит).
 *   3. **retention** (ночью): DELETE items > 30 дней,
 *      DELETE операции > 90 дней в терминальном статусе.
 *
 * Инварианты:
 *   • Глобальный лок `bulk-ops:tick` (30с TTL) — одна пачка одной операции на
 *     всю систему за один tick. Избегаем contention на issue-таблице;
 *     расширение до N-параллельных по projectId — Phase 2.
 *   • Per-item AsyncLocalStorage контекст с `bulkOperationId` — automatic
 *     injection в audit_logs.bulk_operation_id (см. shared/bulk-operation-context.ts).
 *   • Идемпотентность execute'а: если executeTransition выдал исключение
 *     посреди транзакции, Prisma откатит изменения; item → FAILED с errorCode.
 *   • cancel_requested проверяется *между* пачками — уже применённые items
 *     остаются, следующие пропускаются с errorCode='CANCELLED_BY_USER'.
 *   • В `NODE_ENV === 'test'` расписание не стартует; тесты дергают `runTickOnce`
 *     напрямую, как и checkpoint-scheduler паттерн.
 *
 * См. docs/tz/TTBULK-1.md §6.3, §6.4, §5.3.
 */

import type { BulkItemOutcome, BulkOperation, BulkOperationStatus, Prisma } from '@prisma/client';
import type { ScheduledTask } from 'node-cron';
import cron from 'node-cron';
import { prisma } from '../../prisma/client.js';
import { acquireLock, releaseLock, lpopListBatch, publishToChannel } from '../../shared/redis.js';
import { runInBulkOperationContext } from '../../shared/bulk-operation-context.js';
import { getEffectiveUserSystemRoles } from '../../shared/auth/roles.js';
import { captureError } from '../../shared/utils/logger.js';
import { pendingQueueKey } from './bulk-operations.service.js';
import { getExecutor } from './executors/index.js';
import type { IssueWithContext, PreflightResult } from './bulk-operations.types.js';

// ────── Константы / конфиг ──────────────────────────────────────────────────

/** Глобальный лок против мультиинстанс-race'ов. */
const TICK_LOCK_KEY = 'bulk-ops:tick';
/**
 * TTL лока должен быть больше худшего batch-времени (25 items × ~1s в
 * `executeTransition` = 25s) и больше cancel-drain'а (до 20k items — см.
 * finalizeCancelled). 90s даёт ~3× headroom; env-override для staging/prod.
 * RECOVERY_STALE_SECONDS (300s) должен быть существенно больше этого TTL,
 * чтобы recovery не сбрасывал RUNNING op пока tick ещё держит lock.
 */
const TICK_LOCK_TTL_S = Number(process.env.BULK_OP_TICK_LOCK_TTL_S ?? 90);

const BATCH_SIZE = Number(process.env.BULK_OP_BATCH_SIZE ?? 25);
/** Должно быть >> TICK_LOCK_TTL_S × ожидаемое число batches-in-flight. */
const RECOVERY_STALE_SECONDS = Number(process.env.BULK_OP_RECOVERY_STALE_SECONDS ?? 300);
const ITEMS_RETENTION_DAYS = Number(process.env.BULK_OP_ITEMS_RETENTION_DAYS ?? 30);
const OPS_RETENTION_DAYS = Number(process.env.BULK_OP_RETENTION_DAYS ?? 90);
const PROCESSOR_ENABLED = (process.env.BULK_OP_PROCESSOR_ENABLED ?? 'true').toLowerCase() !== 'false';

const TICK_CRON = process.env.BULK_OP_TICK_CRON ?? '*/5 * * * * *';
const RECOVERY_CRON = process.env.BULK_OP_RECOVERY_CRON ?? '*/1 * * * *';
const RETENTION_CRON = process.env.BULK_OP_RETENTION_CRON ?? '30 3 * * *';

// ────── Module state (scheduler lifecycle) ──────────────────────────────────

let tasks: ScheduledTask[] = [];
const runningTicks = new Set<Promise<unknown>>();

function trackTick(p: Promise<unknown>): void {
  runningTicks.add(p);
  p.finally(() => runningTicks.delete(p));
}

export function startBulkOperationsScheduler(): void {
  if (!PROCESSOR_ENABLED) return;
  if (process.env.NODE_ENV === 'test') return;
  if (tasks.length > 0) return;

  tasks.push(cron.schedule(TICK_CRON, () => trackTick(runTickOnce())));
  tasks.push(cron.schedule(RECOVERY_CRON, () => trackTick(runRecoveryOnce())));
  tasks.push(cron.schedule(RETENTION_CRON, () => trackTick(runRetentionOnce())));
}

export async function stopBulkOperationsScheduler(): Promise<void> {
  for (const t of tasks) t.stop();
  tasks = [];
  await Promise.allSettled(Array.from(runningTicks));
}

// ────── tick: обработка одной пачки одной операции ──────────────────────────

export type TickResult =
  | { kind: 'skipped-lock' }
  | { kind: 'idle' } // нет QUEUED/RUNNING операций
  | { kind: 'processed'; operationId: string; batchSize: number; finalized: BulkOperationStatus | null };

/**
 * Один tick — публичная точка входа для `cron`-вызова И для тестов
 * (deterministic execution в `NODE_ENV=test`).
 */
export async function runTickOnce(): Promise<TickResult> {
  const token = await acquireLock(TICK_LOCK_KEY, TICK_LOCK_TTL_S);
  if (!token) return { kind: 'skipped-lock' };

  try {
    // Select oldest active op. Composite-index [status, created_at] добавлен в PR-1
    // именно под этот запрос (см. bulk_operations_status_created_at_idx).
    const op = await prisma.bulkOperation.findFirst({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (!op) return { kind: 'idle' };

    return await processOperationBatch(op);
  } finally {
    await releaseLock(TICK_LOCK_KEY, token);
  }
}

async function processOperationBatch(op: BulkOperation): Promise<TickResult> {
  // Check cancel BEFORE doing work — пропускаем pending items как CANCELLED_BY_USER.
  if (op.cancelRequested && op.status !== 'CANCELLED') {
    return { kind: 'processed', operationId: op.id, batchSize: 0, finalized: await finalizeCancelled(op) };
  }

  // Transition QUEUED → RUNNING + heartbeat на первый tick.
  if (op.status === 'QUEUED') {
    await prisma.bulkOperation.update({
      where: { id: op.id },
      data: { status: 'RUNNING', startedAt: new Date(), heartbeatAt: new Date() },
    });
  }

  // Берём пачку из Redis.
  const batch = await lpopListBatch(pendingQueueKey(op.id), BATCH_SIZE);
  if (batch === null) {
    // Redis недоступен. Не трогаем op — recovery подхватит через RECOVERY_STALE_SECONDS.
    return { kind: 'processed', operationId: op.id, batchSize: 0, finalized: null };
  }
  if (batch.length === 0) {
    // Queue пуст — финализируем.
    return { kind: 'processed', operationId: op.id, batchSize: 0, finalized: await finalize(op) };
  }

  // Processing: per-item preflight + execute под bulkOperationId-контекстом.
  const executor = getExecutor(op.type);
  const counters = { succeeded: 0, failed: 0, skipped: 0 };
  const itemsToInsert: Array<{
    issueId: string;
    issueKey: string;
    outcome: BulkItemOutcome;
    errorCode: string;
    errorMessage: string;
  }> = [];

  if (!executor) {
    // PR-5 добавит остальные executor'ы. В PR-4 не-TRANSITION type'ов не должно
    // быть в QUEUED (service.create не должен их принимать), но защита на случай.
    for (const issueId of batch) {
      counters.failed += 1;
      itemsToInsert.push({
        issueId,
        issueKey: '(unknown)',
        outcome: 'FAILED',
        errorCode: 'EXECUTOR_NOT_IMPLEMENTED',
        errorMessage: `Executor для ${op.type} не реализован — ожидается в PR-5`,
      });
    }
  } else {
    // Actor's эффективные системные роли (DIRECT ∪ GROUP, PR-2) — per-batch
    // fetch, не per-item. Включает SUPER_ADMIN / ADMIN bypass для RBAC,
    // иначе processor молча SKIP'ил бы SUPER_ADMIN-создаваемые операции без
    // явного project-membership (§7.1).
    const actorSystemRoles = await getEffectiveUserSystemRoles(op.createdById);
    const actor = { userId: op.createdById, systemRoles: actorSystemRoles };

    // Подгружаем issue'ы для пачки одним запросом (project.key нужен для issueKey).
    const issues = await prisma.issue.findMany({
      where: { id: { in: batch } },
      include: { project: { select: { id: true, key: true } } },
    });
    const issueById = new Map(issues.map((i) => [i.id, i]));

    for (const issueId of batch) {
      const issue = issueById.get(issueId);
      if (!issue) {
        counters.skipped += 1;
        itemsToInsert.push({
          issueId,
          issueKey: '(deleted)',
          outcome: 'SKIPPED',
          errorCode: 'DELETED',
          errorMessage: 'Задача удалена до обработки',
        });
        continue;
      }
      const issueKey = `${issue.project.key}-${issue.number}`;
      try {
        const preflight: PreflightResult = await executor.preflight(
          issue as IssueWithContext,
          op.payload as unknown,
          actor,
        );
        if (preflight.kind === 'SKIPPED') {
          counters.skipped += 1;
          itemsToInsert.push({
            issueId,
            issueKey,
            outcome: 'SKIPPED',
            errorCode: preflight.reasonCode,
            errorMessage: truncate(preflight.reason, 500),
          });
          continue;
        }
        if (preflight.kind === 'CONFLICT') {
          // В PR-4 conflict без явного пользовательского решения = SKIP.
          counters.skipped += 1;
          itemsToInsert.push({
            issueId,
            issueKey,
            outcome: 'SKIPPED',
            errorCode: preflight.code,
            errorMessage: truncate(preflight.message, 500),
          });
          continue;
        }
        // ELIGIBLE → execute под bulkOperationId-контекстом.
        await runInBulkOperationContext(op.id, () =>
          executor.execute(issue as IssueWithContext, op.payload as unknown, actor),
        );
        counters.succeeded += 1;
      } catch (err) {
        // INVALID_TRANSITION (issue status изменился между preflight и execute)
        // — не execution-failure, а stale state: помечаем SKIPPED / STALE_STATUS,
        // чтобы не раздувать failed-счётчик и не превращать SUCCEEDED в PARTIAL
        // из-за race'а. Retry-failed (PR-6) должен переобработать SKIPPED-items
        // с этим кодом так же, как и FAILED.
        const errAny = err as { code?: string; message?: string } | undefined;
        const isStale = errAny?.code === 'INVALID_TRANSITION';
        captureError(err, { fn: 'processOperationBatch.execute', opId: op.id, issueId, isStale });
        if (isStale) {
          counters.skipped += 1;
          itemsToInsert.push({
            issueId,
            issueKey,
            outcome: 'SKIPPED',
            errorCode: 'STALE_STATUS',
            errorMessage: 'Статус задачи изменился между preview и execute',
          });
        } else {
          counters.failed += 1;
          itemsToInsert.push({
            issueId,
            issueKey,
            outcome: 'FAILED',
            errorCode: 'EXECUTOR_ERROR',
            errorMessage: truncate(errAny?.message ?? 'execution failed', 500),
          });
        }
      }
    }
  }

  // Запись failed/skipped items + инкремент счётчиков одной транзакцией.
  await prisma.$transaction([
    ...(itemsToInsert.length > 0
      ? [
          prisma.bulkOperationItem.createMany({
            data: itemsToInsert.map((i) => ({ ...i, operationId: op.id })),
          }),
        ]
      : []),
    prisma.bulkOperation.update({
      where: { id: op.id },
      data: {
        processed: { increment: batch.length },
        succeeded: { increment: counters.succeeded },
        failed: { increment: counters.failed },
        skipped: { increment: counters.skipped },
        heartbeatAt: new Date(),
      },
    }),
  ]);

  // Если queue ещё не пуст и cancel не запрошен — следующий tick продолжит.
  // Иначе финализируем.
  const updated = await prisma.bulkOperation.findUniqueOrThrow({ where: { id: op.id } });

  // TTBULK-1 PR-6: публикуем progress-event + каждый item в SSE-канал после
  // каждого batch'а. Клиент видит инкремент счётчиков в live-режиме.
  await publishEvents(op.id, updated, itemsToInsert);

  if (updated.cancelRequested) {
    return { kind: 'processed', operationId: op.id, batchSize: batch.length, finalized: await finalizeCancelled(updated) };
  }
  if (updated.processed >= updated.total) {
    return { kind: 'processed', operationId: op.id, batchSize: batch.length, finalized: await finalize(updated) };
  }
  return { kind: 'processed', operationId: op.id, batchSize: batch.length, finalized: null };
}

// ────── SSE event publishing ────────────────────────────────────────────────

function eventsChannel(operationId: string): string {
  return `bulk-op:${operationId}:events`;
}

/** ETA rolling average — grubo оцениваем на основе processed / (now - startedAt). */
function estimateEta(op: BulkOperation): number | null {
  if (!op.startedAt || op.processed === 0) return null;
  const elapsedMs = Date.now() - op.startedAt.getTime();
  const remaining = Math.max(op.total - op.processed, 0);
  if (remaining === 0) return 0;
  const msPerItem = elapsedMs / op.processed;
  return Math.round((msPerItem * remaining) / 1000);
}

/**
 * Публикует SSE events после batch-обработки:
 *   • один `progress` event со счётчиками;
 *   • по одному `item` event на каждый записанный failed/skipped (succeeded
 *     items не пишутся в `BulkOperationItem` — их trace в AuditLog).
 *
 * Каждая публикация — fire-and-forget; Redis down = null, SSE-клиент
 * переживёт через polling-fallback.
 */
async function publishEvents(
  operationId: string,
  op: BulkOperation,
  items: Array<{ issueId: string; issueKey: string; outcome: BulkItemOutcome; errorCode: string; errorMessage: string }>,
): Promise<void> {
  const channel = eventsChannel(operationId);
  await publishToChannel(channel, {
    event: 'progress',
    data: {
      processed: op.processed,
      succeeded: op.succeeded,
      failed: op.failed,
      skipped: op.skipped,
      etaSeconds: estimateEta(op),
    },
  });
  for (const item of items) {
    await publishToChannel(channel, {
      event: 'item',
      data: {
        issueId: item.issueId,
        issueKey: item.issueKey,
        outcome: item.outcome,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
      },
    });
  }
}

// ────── Finalize ─────────────────────────────────────────────────────────────

async function finalize(op: BulkOperation): Promise<BulkOperationStatus> {
  // Status rules:
  //   SUCCEEDED  — есть ≥1 succeeded И failed=0 (skipped допустимо — это нормальный
  //                результат preflight'а, напр. ALREADY_IN_TARGET_STATE).
  //   PARTIAL    — (a) есть и succeeded и failed; либо
  //                (b) succeeded=0 && failed=0 но items были (все SKIPPED) — не
  //                обманываем пользователя зелёной галкой если ничего не изменилось.
  //   FAILED     — все items failed, succeeded=0.
  const status: BulkOperationStatus =
    op.failed === 0 && op.succeeded > 0 ? 'SUCCEEDED'
      : op.failed === 0 && op.succeeded === 0 ? 'PARTIAL' // all-skipped — misleading как SUCCEEDED
        : op.succeeded > 0 ? 'PARTIAL'
          : 'FAILED';
  await prisma.bulkOperation.update({
    where: { id: op.id },
    data: { status, finishedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      action: 'bulk_operation.completed',
      entityType: 'bulk_operation',
      entityId: op.id,
      userId: op.createdById,
      bulkOperationId: op.id,
      details: {
        status,
        total: op.total,
        succeeded: op.succeeded,
        failed: op.failed,
        skipped: op.skipped,
      } as Prisma.InputJsonValue,
    },
  });
  // Финальный status-event — SSE-клиент закрывает соединение после этого.
  await publishToChannel(eventsChannel(op.id), {
    event: 'status',
    data: { status, finishedAt: new Date().toISOString() },
  });
  return status;
}

async function finalizeCancelled(op: BulkOperation): Promise<BulkOperationStatus> {
  // Оставшиеся в pending-queue items помечаем SKIPPED CANCELLED_BY_USER.
  // Дренаж queue — LPOP до дна (либо до MAX_DRAIN). При больших queue (>5k items)
  // drain может занять > RECOVERY_STALE_SECONDS — обновляем heartbeat каждые
  // ~10с, чтобы recovery-cron не сбросил op в QUEUED посреди дренажа
  // (double-finalize race, pre-push review #4).
  const MAX_DRAIN = 20_000;
  const HEARTBEAT_INTERVAL_MS = 10_000;
  let drained = 0;
  let lastHeartbeat = Date.now();
  const key = pendingQueueKey(op.id);
  while (drained < MAX_DRAIN) {
    const chunk = await lpopListBatch(key, BATCH_SIZE);
    if (!chunk || chunk.length === 0) break;
    await prisma.bulkOperationItem.createMany({
      data: chunk.map((issueId) => ({
        operationId: op.id,
        issueId,
        issueKey: '(cancelled)',
        outcome: 'SKIPPED' as BulkItemOutcome,
        errorCode: 'CANCELLED_BY_USER',
        errorMessage: 'Операция отменена пользователем до обработки этой задачи',
      })),
    });
    drained += chunk.length;
    if (Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
      await prisma.bulkOperation.update({
        where: { id: op.id },
        data: { heartbeatAt: new Date() },
      });
      lastHeartbeat = Date.now();
    }
  }

  await prisma.bulkOperation.update({
    where: { id: op.id },
    data: {
      status: 'CANCELLED',
      finishedAt: new Date(),
      skipped: { increment: drained },
      processed: { increment: drained },
    },
  });
  await prisma.auditLog.create({
    data: {
      action: 'bulk_operation.cancelled',
      entityType: 'bulk_operation',
      entityId: op.id,
      userId: op.createdById,
      bulkOperationId: op.id,
      details: { drainedFromQueue: drained } as Prisma.InputJsonValue,
    },
  });
  await publishToChannel(eventsChannel(op.id), {
    event: 'status',
    data: { status: 'CANCELLED', finishedAt: new Date().toISOString() },
  });
  return 'CANCELLED';
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// ────── Recovery: stale RUNNING → QUEUED ─────────────────────────────────────

export async function runRecoveryOnce(): Promise<{ reset: number }> {
  const threshold = new Date(Date.now() - RECOVERY_STALE_SECONDS * 1000);
  const res = await prisma.bulkOperation.updateMany({
    where: {
      status: 'RUNNING',
      heartbeatAt: { lt: threshold },
    },
    data: { status: 'QUEUED' },
  });
  return { reset: res.count };
}

// ────── Retention: purge old items + completed ops ──────────────────────────

export async function runRetentionOnce(): Promise<{ deletedItems: number; deletedOperations: number }> {
  const itemsCutoff = new Date(Date.now() - ITEMS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const opsCutoff = new Date(Date.now() - OPS_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const items = await prisma.bulkOperationItem.deleteMany({
    where: { processedAt: { lt: itemsCutoff } },
  });
  const operations = await prisma.bulkOperation.deleteMany({
    where: {
      createdAt: { lt: opsCutoff },
      status: { notIn: ['QUEUED', 'RUNNING'] },
    },
  });
  return { deletedItems: items.count, deletedOperations: operations.count };
}
