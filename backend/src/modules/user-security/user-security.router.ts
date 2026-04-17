import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { getUserSecurity } from './user-security.service.js';

/**
 * TTSEC-2 Phase 2 security endpoints.
 *
 * GET /api/users/me/security — any authenticated user reads THEIR OWN payload (SEC-2).
 * GET /api/admin/users/:id/security — system ADMIN reads any user's payload (SEC-6).
 *
 * Phase 4 cleanup: swap the admin check from `requireRole('ADMIN')` to a proper system-level
 * `USER_GROUP_VIEW` permission once the helper lands.
 */

const router = Router();

router.get('/users/me/security', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json(await getUserSecurity(req.user!.userId));
  } catch (err) { next(err); }
});

router.get(
  '/admin/users/:id/security',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      res.json(await getUserSecurity(req.params.id as string));
    } catch (err) { next(err); }
  },
);

export default router;
