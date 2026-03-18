import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { aiEstimateDto, aiDecomposeDto, aiSuggestAssigneeDto } from './ai.dto.js';
import * as aiService from './ai.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

router.post(
  '/ai/estimate',
  requireRole('ADMIN', 'MANAGER', 'USER'),
  validate(aiEstimateDto),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await aiService.estimateIssue(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/ai/decompose',
  requireRole('ADMIN', 'MANAGER', 'USER'),
  validate(aiDecomposeDto),
  async (req: AuthRequest, res, next) => {
    try {
      const creatorId = req.user!.userId;
      const result = await aiService.decomposeIssue(req.body, creatorId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/ai/suggest-assignee',
  requireRole('ADMIN', 'MANAGER', 'USER'),
  validate(aiSuggestAssigneeDto),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await aiService.suggestAssignee(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
