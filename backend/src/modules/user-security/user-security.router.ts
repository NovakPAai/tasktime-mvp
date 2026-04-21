import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { getUserSecurity } from './user-security.service.js';
import { authHandler } from '../../shared/utils/async-handler.js';

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

router.get('/users/me/security', authenticate, authHandler(async (req, res) => {
  res.json(await getUserSecurity(req.user!.userId));
}));

router.get(
  '/admin/users/:id/security',
  authenticate,
  requireRole('ADMIN'),
  authHandler(async (req, res) => {
    res.json(await getUserSecurity(req.params.id as string));
  }),
);

export default router;
