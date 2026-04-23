/**
 * TTBULK-1 — Router для массовых операций над issue'ами.
 *
 * Точка входа: `/api/bulk-operations/*`.
 *
 * Публичный API (см. §4 ТЗ):
 *   POST   /api/bulk-operations/preview     — dry-run, возвращает previewToken.
 *   POST   /api/bulk-operations             — создание операции по previewToken.
 *                                             Idempotency-Key обязателен.
 *   GET    /api/bulk-operations/:id         — статус + счётчики.
 *   POST   /api/bulk-operations/:id/cancel  — запросить отмену.
 *   GET    /api/bulk-operations             — список своих операций.
 *
 * Роуты /stream (SSE), /report.csv и /retry-failed — добавляются в PR-6.
 *
 * Gate по `features.bulkOps` — в app.ts (условный mount). При выключенном флаге
 * роутер не подключается → fall-through на default 404 Express'а.
 *
 * Инварианты:
 *   • Все роуты за `authenticate + requireRole('BULK_OPERATOR')`.
 *     SUPER_ADMIN bypass через `hasSystemRole` (уже встроен в requireRole).
 *   • Rate-limit 30 req/min/user на preview + create (TZ §5.6 аналог для search).
 *   • Idempotency-Key читается из заголовка `Idempotency-Key` (UUID).
 *     Отсутствие заголовка на POST / — 400 IDEMPOTENCY_KEY_REQUIRED.
 *   • try/catch + next(err) на всех handlers — консистентно с saved-filters /
 *     search / issues.router.ts.
 *
 * См. docs/tz/TTBULK-1.md §4.1.
 */

import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { rateLimit } from '../../shared/middleware/rate-limit.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { hasGlobalProjectReadAccess } from '../../shared/auth/roles.js';
import { prisma } from '../../prisma/client.js';
import type { AuthRequest } from '../../shared/types/index.js';
import {
  previewBulkOperationDto,
  createBulkOperationDto,
  listQueryDto,
  type ListQueryDto,
} from './bulk-operations.dto.js';
import * as service from './bulk-operations.service.js';

const router = Router();

// Максимум accessible-project-ids для scope=jql — такой же, как в search.router.ts.
const MAX_ACCESSIBLE_PROJECTS = 5_000;

/**
 * Собирает список проектов, к которым у юзера есть read-access. Консистентно с
 * `resolveAccessibleProjectIds` из search.router.ts — глобальные read-роли
 * видят всё, остальные — только прямые members.
 */
async function resolveAccessibleProjectIds(req: AuthRequest): Promise<readonly string[]> {
  if (!req.user) return [];
  if (hasGlobalProjectReadAccess(req.user.systemRoles)) {
    const all = await prisma.project.findMany({
      select: { id: true },
      take: MAX_ACCESSIBLE_PROJECTS,
    });
    return all.map((p) => p.id);
  }
  const memberships = await prisma.userProjectRole.findMany({
    where: { userId: req.user.userId },
    select: { projectId: true },
    take: MAX_ACCESSIBLE_PROJECTS,
  });
  return memberships.map((m) => m.projectId);
}

function requireActor(req: AuthRequest): { userId: string; systemRoles: AuthRequest['user'] extends { systemRoles: infer R } ? R : never } {
  if (!req.user) throw new AppError(401, 'Authentication required');
  return { userId: req.user.userId, systemRoles: req.user.systemRoles as never };
}

// Idempotency-Key: UUID заголовок, обязателен на POST /.
const idempotencyKeySchema = z.string().uuid();

const bulkOpsRateLimit = rateLimit({ scope: 'bulk-ops', limit: 30, windowMs: 60_000 });

// Общий middleware-chain для всех роутов: auth + BULK_OPERATOR.
router.use(authenticate);
router.use(requireRole('BULK_OPERATOR'));

// ────── POST /preview ────────────────────────────────────────────────────────

router.post(
  '/bulk-operations/preview',
  bulkOpsRateLimit,
  validate(previewBulkOperationDto),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireActor(req);
      const accessibleProjectIds = await resolveAccessibleProjectIds(req);
      const body = req.body as import('./bulk-operations.dto.js').PreviewBulkOperationDto;
      const preview = await service.previewBulkOperation(body, {
        userId: actor.userId,
        systemRoles: req.user!.systemRoles,
        accessibleProjectIds,
      });
      res.status(200).json(preview);
    } catch (err) {
      next(err);
    }
  },
);

// ────── POST / (create) ──────────────────────────────────────────────────────

router.post(
  '/bulk-operations',
  bulkOpsRateLimit,
  validate(createBulkOperationDto),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireActor(req);
      const idempotencyKeyRaw = req.header('Idempotency-Key');
      if (!idempotencyKeyRaw) {
        throw new AppError(400, 'Idempotency-Key header is required', { code: 'IDEMPOTENCY_KEY_REQUIRED' });
      }
      const idempotencyKey = idempotencyKeySchema.parse(idempotencyKeyRaw);
      const body = req.body as import('./bulk-operations.dto.js').CreateBulkOperationDto;

      const result = await service.createBulkOperation(
        { previewToken: body.previewToken, idempotencyKey },
        { userId: actor.userId, systemRoles: req.user!.systemRoles },
      );
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(new AppError(400, 'Invalid Idempotency-Key (must be UUID)', { code: 'IDEMPOTENCY_KEY_INVALID' }));
      }
      next(err);
    }
  },
);

// ────── GET /:id ─────────────────────────────────────────────────────────────

router.get(
  '/bulk-operations/:id',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireActor(req);
      const op = await service.getBulkOperation((req.params.id as string), {
        userId: actor.userId,
        systemRoles: req.user!.systemRoles,
      });
      res.status(200).json(op);
    } catch (err) {
      next(err);
    }
  },
);

// ────── POST /:id/cancel ─────────────────────────────────────────────────────

router.post(
  '/bulk-operations/:id/cancel',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireActor(req);
      const op = await service.cancelBulkOperation((req.params.id as string), {
        userId: actor.userId,
        systemRoles: req.user!.systemRoles,
      });
      res.status(200).json(op);
    } catch (err) {
      next(err);
    }
  },
);

// ────── GET / (list mine) ────────────────────────────────────────────────────

router.get(
  '/bulk-operations',
  validate(listQueryDto, 'query'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireActor(req);
      const query = req.query as unknown as ListQueryDto;
      const result = await service.listBulkOperations(
        { userId: actor.userId, systemRoles: req.user!.systemRoles },
        query,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
