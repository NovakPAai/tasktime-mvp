/**
 * TTSRH-1 PR-7 — SavedFilter CRUD + share + favorite routes.
 *
 * Публичный API (§5.6 ТЗ):
 *   GET    /api/saved-filters?scope=mine|shared|public|favorite
 *   POST   /api/saved-filters
 *   GET    /api/saved-filters/:id
 *   PATCH  /api/saved-filters/:id
 *   DELETE /api/saved-filters/:id
 *   POST   /api/saved-filters/:id/favorite      { value: bool }
 *   POST   /api/saved-filters/:id/share         { users?, groups?, permission }
 *   POST   /api/saved-filters/:id/use           — инкремент useCount, вызывает фронт
 *                                                  перед исполнением (§5.6 прим.).
 *
 * Gate по `features.advancedSearch` — в app.ts (условный mount).
 *
 * Инварианты:
 *   • Все handlers проходят через authenticate (401 если не логинен).
 *   • Zod-валидация на body/query обязательна (см. saved-filters.dto.ts).
 *   • RBAC (R-SF-1 / R-SF-2) — в service; роутер только передаёт userId.
 *   • Write-audit пишется из service (после успешной мутации).
 */

import { Router, type Response } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import type { AuthRequest } from '../../shared/types/index.js';
import {
  listQueryDto,
  createDto,
  updateDto,
  favoriteDto,
  shareDto,
  type ListQueryDto,
  type CreateDto,
  type UpdateDto,
  type FavoriteDto,
  type ShareDto,
} from './saved-filters.dto.js';
import * as service from './saved-filters.service.js';

const router = Router();
router.use(authenticate);

function requireUser(req: AuthRequest, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return req.user.userId;
}

router.get('/saved-filters', validate(listQueryDto, 'query'), async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { scope } = req.query as ListQueryDto;
    const filters = await service.listFilters(userId, scope);
    res.json({ filters });
  } catch (err) {
    next(err);
  }
});

router.post('/saved-filters', validate(createDto), async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const dto = req.body as CreateDto;
    const filter = await service.createFilter(userId, dto);
    res.status(201).json(filter);
  } catch (err) {
    next(err);
  }
});

router.get('/saved-filters/:id', async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const filter = await service.getFilter(userId, req.params.id as string);
    res.json(filter);
  } catch (err) {
    next(err);
  }
});

router.patch('/saved-filters/:id', validate(updateDto), async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const dto = req.body as UpdateDto;
    const filter = await service.updateFilter(userId, req.params.id as string, dto);
    res.json(filter);
  } catch (err) {
    next(err);
  }
});

router.delete('/saved-filters/:id', async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    await service.deleteFilter(userId, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post(
  '/saved-filters/:id/favorite',
  validate(favoriteDto),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = requireUser(req, res);
      if (!userId) return;
      const { value } = req.body as FavoriteDto;
      const filter = await service.setFavorite(userId, req.params.id as string, value);
      res.json(filter);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/saved-filters/:id/share',
  validate(shareDto),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = requireUser(req, res);
      if (!userId) return;
      const dto = req.body as ShareDto;
      const filter = await service.shareFilter(userId, req.params.id as string, dto);
      res.json(filter);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/saved-filters/:id/use', async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    await service.incrementUseStats(userId, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
