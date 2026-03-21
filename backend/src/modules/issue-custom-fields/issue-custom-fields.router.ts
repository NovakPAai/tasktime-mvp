import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { upsertCustomFieldValuesDto } from './issue-custom-fields.dto.js';
import * as service from './issue-custom-fields.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

// GET /api/issues/:id/custom-fields — applicable fields + current values
router.get('/issues/:id/custom-fields', async (req, res, next) => {
  try {
    const result = await service.getIssueCustomFields(req.params.id as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/issues/:id/custom-fields — batch upsert values
// VIEWER cannot write; USER and above can
router.put(
  '/issues/:id/custom-fields',
  requireRole('USER'),
  validate(upsertCustomFieldValuesDto),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await service.upsertIssueCustomFields(
        req.params.id as string,
        req.body,
        req.user!.userId,
      );
      await logAudit(req, 'issue.custom_fields_updated', 'issue', req.params.id as string, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
