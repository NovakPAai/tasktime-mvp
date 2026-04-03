import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createTransitionScreenDto,
  updateTransitionScreenDto,
  screenItemsDto,
} from './transition-screens.dto.js';
import * as service from './transition-screens.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listTransitionScreens());
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createTransitionScreenDto), async (req: AuthRequest, res, next) => {
  try {
    const screen = await service.createTransitionScreen(req.body);
    await logAudit(req, 'transition_screen.created', 'transition_screen', screen.id, req.body);
    res.status(201).json(screen);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getTransitionScreen(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateTransitionScreenDto), async (req: AuthRequest, res, next) => {
  try {
    const screen = await service.updateTransitionScreen(req.params.id as string, req.body);
    await logAudit(req, 'transition_screen.updated', 'transition_screen', req.params.id as string, req.body);
    res.json(screen);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteTransitionScreen(req.params.id as string);
    await logAudit(req, 'transition_screen.deleted', 'transition_screen', req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/items', validate(screenItemsDto), async (req: AuthRequest, res, next) => {
  try {
    const screen = await service.replaceItems(req.params.id as string, req.body);
    await logAudit(req, 'transition_screen.items_updated', 'transition_screen', req.params.id as string, req.body);
    res.json(screen);
  } catch (err) {
    next(err);
  }
});

export default router;
