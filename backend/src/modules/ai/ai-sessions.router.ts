import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createAiSessionDto } from './ai-sessions.dto.js';
import * as aiSessionsService from './ai-sessions.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

// AI session creation requires ADMIN (system agent has ADMIN role via seed)
router.post(
  '/ai-sessions',
  requireRole('ADMIN'),
  validate(createAiSessionDto),
  async (req: AuthRequest, res, next) => {
    try {
      const session = await aiSessionsService.createAiSession(req.body);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  },
);

export default router;

