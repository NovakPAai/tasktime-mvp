/**
 * TTBULK-1 PR-10 — SSE hook с polling fallback.
 *
 * Подключается к `GET /api/bulk-operations/:id/stream` (EventSource) и
 * обновляет store через `updateOperation(id, { status, snapshot })` при
 * каждом event'е. Polling fallback (2s interval) активируется когда:
 *   • `EventSource` неудалось создать (например, corp-proxy блокирует SSE).
 *   • Соединение оборвалось и не восстановилось в пределах 5s.
 *
 * Events от backend (см. bulk-operations.processor.ts:publishEvents):
 *   • `progress` — { processed, succeeded, failed, skipped, etaSeconds }.
 *   • `item`     — { issueId, issueKey, outcome, errorCode, errorMessage }.
 *   • `status`   — { status: BulkOperationStatus, finishedAt: string }.
 *     После status-event SSE-stream закрывается (backend disconnect'ит).
 *
 * Invariants:
 *   • Hook не возвращает data напрямую — state обновляется через zustand
 *     store. Consumer читает store.
 *   • Disconnect/unmount cleanup — EventSource.close() + clearInterval(poll).
 *   • Polling — через `bulkOperationsApi.get(id)` (axios instance с auth).
 *     Native EventSource не поддерживает Authorization header; в cookie-auth
 *     сценариях SSE работает, иначе — сразу polling fallback.
 *
 * См. docs/tz/TTBULK-1.md §3.3, §6.6, §13.7 PR-10.
 */

import { useEffect, useRef } from 'react';
import { bulkOperationsApi } from '../../api/bulkOperations';
import { useBulkOperationsStore } from '../../store/bulkOperations.store';
import type { BulkOperation } from '../../types/bulk.types';

const POLL_INTERVAL_MS = 2000;
const SSE_RECONNECT_TIMEOUT_MS = 5000;

/** Null = операция закрыта / не отслеживается. */
export function useBulkOperationStream(operationId: string | null): void {
  const updateOperation = useBulkOperationsStore((s) => s.updateOperation);
  // Stable ref — чтобы useEffect cleanup видел самый свежий id при detach.
  const idRef = useRef<string | null>(operationId);
  idRef.current = operationId;

  useEffect(() => {
    if (!operationId) return;

    let sse: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const applySnapshot = (snapshot: BulkOperation) => {
      if (cancelled) return;
      updateOperation(operationId, {
        status: snapshot.status,
        snapshot,
      });
    };

    const startPolling = () => {
      if (pollTimer) return;
      const tick = async () => {
        if (cancelled) return;
        try {
          const snapshot = await bulkOperationsApi.get(operationId);
          applySnapshot(snapshot);
          // Terminal статусы → перестаём polling'ить.
          if (isTerminalStatus(snapshot.status)) {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
          }
        } catch {
          // Пусть continue — 5xx / transient; terminal status пришлёт SSE.
        }
      };
      // Первый tick сразу, потом каждые POLL_INTERVAL_MS.
      void tick();
      pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    };

    // Пробуем SSE в cookie-auth сценариях (native EventSource auth-headers не шлёт).
    try {
      sse = new EventSource(bulkOperationsApi.streamUrl(operationId));

      const handleProgress = (ev: MessageEvent<string>) => {
        try {
          const data = JSON.parse(ev.data) as {
            processed: number;
            succeeded: number;
            failed: number;
            skipped: number;
          };
          updateOperation(operationId, {
            snapshot: { ...extractCurrentSnapshot(operationId), ...data } as BulkOperation,
          });
        } catch {
          // ignore malformed
        }
      };

      const handleStatus = (ev: MessageEvent<string>) => {
        try {
          const data = JSON.parse(ev.data) as {
            status: BulkOperation['status'];
            finishedAt: string;
          };
          updateOperation(operationId, {
            status: data.status,
            snapshot: {
              ...extractCurrentSnapshot(operationId),
              status: data.status,
              finishedAt: data.finishedAt,
            } as BulkOperation,
          });
          // Terminal status — закрываем оба канала. Polling мог быть запущен
          // из handleError если SSE временно отваливался; без clearInterval
          // он продолжил бы бить API до первого terminal-status tick'а poll'а.
          sse?.close();
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } catch {
          // ignore
        }
      };

      const handleError = () => {
        // EventSource автоматически ретраит; если за SSE_RECONNECT_TIMEOUT_MS
        // не восстановится — переходим на polling для устойчивости.
        setTimeout(() => {
          if (cancelled) return;
          if (sse && sse.readyState !== EventSource.OPEN) {
            sse.close();
            sse = null;
            startPolling();
          }
        }, SSE_RECONNECT_TIMEOUT_MS);
      };

      sse.addEventListener('progress', handleProgress as EventListener);
      sse.addEventListener('status', handleStatus as EventListener);
      sse.addEventListener('error', handleError);
    } catch {
      // EventSource недоступен (SSR, broken environment) — сразу polling.
      startPolling();
    }

    return () => {
      cancelled = true;
      if (sse) sse.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [operationId, updateOperation]);
}

function isTerminalStatus(s: BulkOperation['status']): boolean {
  return s === 'SUCCEEDED' || s === 'PARTIAL' || s === 'FAILED' || s === 'CANCELLED';
}

function extractCurrentSnapshot(id: string): Partial<BulkOperation> {
  return useBulkOperationsStore.getState().operations[id]?.snapshot ?? {};
}
