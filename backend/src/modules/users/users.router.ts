import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { updatePreferencesDto, updateUserDto } from './users.dto.js';
import * as usersService from './users.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const users = await usersService.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// TTSRH-1 PR-7 — per-user UI preferences (search columns, page size). Must be
// declared before `/:id` so Express doesn't greedy-match `me` as an id.
router.get('/me/preferences', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const prefs = await usersService.getPreferences(req.user.userId);
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/me/preferences',
  validate(updatePreferencesDto),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const prefs = await usersService.updatePreferences(req.user.userId, req.body);
      res.json(prefs);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', async (req, res, next) => {
  try {
    const user = await usersService.getUser(req.params.id as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateUserDto), async (req: AuthRequest, res, next) => {
  try {
    const user = await usersService.updateUser(req.params.id as string, req.body);
    await logAudit(req, 'user.updated', 'user', req.params.id as string, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Deprecated: use /admin/users/:id/system-roles instead
router.patch('/:id/role', (_req, res) => {
  res.status(410).json({
    error: 'Deprecated',
    message: 'Use GET/POST/DELETE /api/admin/users/:id/system-roles instead',
  });
});

router.patch('/:id/deactivate', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const user = await usersService.deactivateUser(req.params.id as string);
    await logAudit(req, 'user.deactivated', 'user', req.params.id as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
