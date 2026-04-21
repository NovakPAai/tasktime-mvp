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
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listTransitionScreens());
}));

router.post('/', validate(createTransitionScreenDto), authHandler(async (req, res) => {
  const screen = await service.createTransitionScreen(req.body);
  await logAudit(req, 'transition_screen.created', 'transition_screen', screen.id, req.body);
  res.status(201).json(screen);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getTransitionScreen(req.params.id as string));
}));

router.patch('/:id', validate(updateTransitionScreenDto), authHandler(async (req, res) => {
  const screen = await service.updateTransitionScreen(req.params.id as string, req.body);
  await logAudit(req, 'transition_screen.updated', 'transition_screen', req.params.id as string, req.body);
  res.json(screen);
}));

router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteTransitionScreen(req.params.id as string);
  await logAudit(req, 'transition_screen.deleted', 'transition_screen', req.params.id as string);
  res.json({ ok: true });
}));

router.put('/:id/items', validate(screenItemsDto), authHandler(async (req, res) => {
  const screen = await service.replaceItems(req.params.id as string, req.body);
  await logAudit(req, 'transition_screen.items_updated', 'transition_screen', req.params.id as string, req.body);
  res.json(screen);
}));

export default router;
