// TTMP-160 PR-10: burndown endpoints.
//   GET  /api/releases/:releaseId/burndown[?metric=…&from=YYYY-MM-DD&to=YYYY-MM-DD]
//   POST /api/releases/:releaseId/burndown/backfill  { date?: YYYY-MM-DD }
//
// Gates (spec §10):
//   - GET — same release-read gate as /checkpoints (SEC-2).
//   - POST /backfill — SEC-8: only SUPER_ADMIN/ADMIN can rewrite history. RELEASE_MANAGER
//     intentionally excluded so the manual backfill can't be used to paper over live
//     incidents.

import { z } from 'zod';
import { Router } from 'express';
import type { ProjectPermission } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { authenticate } from '../../../shared/middleware/auth.js';
import {
  assertProjectPermission,
  requireRole,
} from '../../../shared/middleware/rbac.js';
import { validate } from '../../../shared/middleware/validate.js';
import { logAudit } from '../../../shared/middleware/audit.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { hasAnySystemRole } from '../../../shared/auth/roles.js';
import type { AuthRequest } from '../../../shared/types/index.js';
import * as burndown from './burndown.service.js';

const router = Router();
router.use(authenticate);

// Refinement: regex alone would accept "2026-13-99". We cross-check with `Date.parse`
// so semantically invalid dates reach the handler as 400 instead of leaking to Prisma
// as a runtime 500.
const ymdString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime()), {
    message: 'Некорректная календарная дата',
  });

export const burndownQueryDto = z.object({
  metric: z.enum(['issues', 'hours', 'violations']).default('issues'),
  from: ymdString.optional(),
  to: ymdString.optional(),
});

export const backfillDto = z.object({
  date: ymdString.optional(),
});

async function assertReleaseRead(req: AuthRequest, releaseId: string): Promise<void> {
  await assertReleasePermission(req, releaseId, ['RELEASES_VIEW']);
}

async function assertReleasePermission(
  req: AuthRequest,
  releaseId: string,
  perms: ProjectPermission[],
): Promise<void> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { projectId: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');

  const hasGlobalRole = hasAnySystemRole(req.user!.systemRoles, [
    'ADMIN',
    'RELEASE_MANAGER',
    'SUPER_ADMIN',
  ]);
  if (hasGlobalRole) return;

  if (release.projectId) {
    await assertProjectPermission(req.user!, release.projectId, perms);
    return;
  }
  throw new AppError(403, 'Недостаточно прав для межпроектного релиза');
}

router.get(
  '/releases/:releaseId/burndown',
  validate(burndownQueryDto, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const releaseId = req.params.releaseId as string;
      await assertReleaseRead(req, releaseId);
      const { metric, from, to } = req.query as {
        metric: burndown.BurndownMetric;
        from?: string;
        to?: string;
      };
      const data = await burndown.getBurndown(releaseId, { metric, from, to });
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

// FR-31 / SEC-8: backfill requires SUPER_ADMIN/ADMIN. RELEASE_MANAGER deliberately not listed.
router.post(
  '/releases/:releaseId/burndown/backfill',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  validate(backfillDto, 'body'),
  async (req: AuthRequest, res, next) => {
    try {
      const releaseId = req.params.releaseId as string;
      // We don't call assertReleaseRead here — the requireRole gate above is strictly stronger
      // (ADMIN/SUPER_ADMIN have global access). Release existence is validated inside
      // captureSnapshot → 404 bubbles out naturally, no silent insert on a missing release.
      const dateStr = (req.body as { date?: string }).date;
      const date = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : undefined;
      const snapshot = await burndown.backfillSnapshot(releaseId, date);
      await logAudit(req, 'burndown.backfilled', 'release', releaseId, {
        snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
      });
      res.status(201).json({
        id: snapshot.id,
        snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
        capturedAt: snapshot.capturedAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
