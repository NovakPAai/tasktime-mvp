/**
 * TTBULK-1 PR-10 — zustand store для массовых операций (frontend).
 *
 * Хранит активные / recently-finished операции юзера, текущее состояние
 * drawer (open / collapsed / closed), mapping operationId → subscription
 * state (для SSE hook). Chip'ы (`BulkOperationChips`) и progress drawer
 * (`BulkOperationProgressDrawer`) читают state отсюда.
 *
 * Invariants:
 *   • Одна операция одновременно может быть: active (QUEUED/RUNNING) или
 *     finished (SUCCEEDED/PARTIAL/FAILED/CANCELLED).
 *   • Finished операции убираются из store через `removeOperation(id)` —
 *     когда пользователь закрывает chip или drawer.
 *   • `drawerOperationId` = id открытой в drawer операции (или null).
 *   • Wizard submit → `addOperation({ id, status: 'QUEUED' })` +
 *     `setDrawerOperationId(id)` для открытия drawer'а.
 *
 * См. docs/tz/TTBULK-1.md §3.3, §13.7 PR-10.
 */

import { create } from 'zustand';
import type { BulkOperation, BulkOperationStatus } from '../types/bulk.types';

export interface TrackedBulkOperation {
  id: string;
  status: BulkOperationStatus;
  /** Последний snapshot — обновляется через SSE / poll. */
  snapshot: BulkOperation | null;
  /** Когда операция добавлена в store (для ordering chip'ов). */
  addedAt: number;
}

interface BulkOperationsState {
  operations: Record<string, TrackedBulkOperation>;
  /** Id операции в открытом drawer'е (одна в каждый момент). null = drawer closed. */
  drawerOperationId: string | null;

  addOperation: (op: { id: string; status: BulkOperationStatus; snapshot?: BulkOperation }) => void;
  updateOperation: (id: string, update: Partial<Pick<TrackedBulkOperation, 'status' | 'snapshot'>>) => void;
  removeOperation: (id: string) => void;
  setDrawerOperationId: (id: string | null) => void;
  /** Cherry-picks active ops (QUEUED/RUNNING) для rendering chip'ов. */
  getActiveOperations: () => TrackedBulkOperation[];
}

const ACTIVE_STATUSES: readonly BulkOperationStatus[] = ['QUEUED', 'RUNNING'];

export const useBulkOperationsStore = create<BulkOperationsState>((set, get) => ({
  operations: {},
  drawerOperationId: null,

  addOperation: ({ id, status, snapshot }) =>
    set((s) => ({
      operations: {
        ...s.operations,
        [id]: {
          id,
          status,
          snapshot: snapshot ?? null,
          addedAt: Date.now(),
        },
      },
    })),

  updateOperation: (id, update) =>
    set((s) => {
      const existing = s.operations[id];
      if (!existing) return s; // игнорим события для unknown ops (cross-tab)
      return {
        operations: {
          ...s.operations,
          [id]: {
            ...existing,
            status: update.status ?? existing.status,
            snapshot: update.snapshot ?? existing.snapshot,
          },
        },
      };
    }),

  removeOperation: (id) =>
    set((s) => {
      if (!s.operations[id]) return s;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _removed, ...rest } = s.operations;
      return {
        operations: rest,
        // Если закрыли ту операцию, что была в drawer — закрываем drawer тоже.
        drawerOperationId: s.drawerOperationId === id ? null : s.drawerOperationId,
      };
    }),

  setDrawerOperationId: (id) => set({ drawerOperationId: id }),

  getActiveOperations: () => {
    const ops = Object.values(get().operations);
    return ops
      .filter((o) => ACTIVE_STATUSES.includes(o.status))
      .sort((a, b) => b.addedAt - a.addedAt);
  },
}));
