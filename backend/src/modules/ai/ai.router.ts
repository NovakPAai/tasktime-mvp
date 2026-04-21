import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { aiEstimateDto, aiDecomposeDto, aiSuggestAssigneeDto } from './ai.dto.js';
import * as aiService from './ai.service.js';
import { authHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

router.post(
  '/ai/estimate',
  requireRole('ADMIN', 'USER'),
  validate(aiEstimateDto),
  authHandler(async (req, res) => {
    const result = await aiService.estimateIssue(req.body);
    res.json(result);
  }),
);

router.post(
  '/ai/decompose',
  requireRole('ADMIN', 'USER'),
  validate(aiDecomposeDto),
  authHandler(async (req, res) => {
    const result = await aiService.decomposeIssue(req.body);
    res.status(201).json(result);
  }),
);

router.post(
  '/ai/suggest-assignee',
  requireRole('ADMIN', 'USER'),
  validate(aiSuggestAssigneeDto),
  authHandler(async (req, res) => {
    const result = await aiService.suggestAssignee(req.body);
    res.json(result);
  }),
);

export default router;
