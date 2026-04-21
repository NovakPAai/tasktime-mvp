import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { updatePreferencesDto, updateUserDto } from './users.dto.js';
import * as usersService from './users.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
  const users = await usersService.listUsers();
  res.json(users);
}));

// TTSRH-1 PR-7 — per-user UI preferences (search columns, page size). Must be
// declared before `/:id` so Express doesn't greedy-match `me` as an id.
router.get('/me/preferences', authHandler(async (req, res) => {
  const prefs = await usersService.getPreferences(req.user!.userId);
  res.json(prefs);
}));

router.patch(
  '/me/preferences',
  validate(updatePreferencesDto),
  authHandler(async (req, res) => {
    const prefs = await usersService.updatePreferences(req.user!.userId, req.body);
    res.json(prefs);
  }),
);

router.get('/:id', asyncHandler(async (req, res) => {
  const user = await usersService.getUser(req.params.id as string);
  res.json(user);
}));

router.patch('/:id', validate(updateUserDto), authHandler(async (req, res) => {
  const user = await usersService.updateUser(req.params.id as string, req.body);
  await logAudit(req, 'user.updated', 'user', req.params.id as string, req.body);
  res.json(user);
}));

// Deprecated: use /admin/users/:id/system-roles instead
router.patch('/:id/role', (_req, res) => {
  res.status(410).json({
    error: 'Deprecated',
    message: 'Use GET/POST/DELETE /api/admin/users/:id/system-roles instead',
  });
});

router.patch('/:id/deactivate', requireRole('ADMIN'), authHandler(async (req, res) => {
  const user = await usersService.deactivateUser(req.params.id as string);
  await logAudit(req, 'user.deactivated', 'user', req.params.id as string);
  res.json(user);
}));

export default router;
