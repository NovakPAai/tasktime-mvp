// TTMP-160 PR-8 / FR-23: checkpoint-violation audit endpoints for the admin page.
// SEC-6: gated on SUPER_ADMIN / ADMIN / AUDITOR.

import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/auth.js';
import { requireRole } from '../../../shared/middleware/rbac.js';
import { validate } from '../../../shared/middleware/validate.js';
import type { AuthRequest } from '../../../shared/types/index.js';
import { auditQueryDto } from './release-checkpoint.dto.js';
import * as audit from './audit.service.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN', 'AUDITOR'));

// JSON listing with filters.
router.get('/', validate(auditQueryDto, 'query'), async (req: AuthRequest, res, next) => {
  try {
    const events = await audit.listAuditEvents(req.query as unknown as Parameters<typeof audit.listAuditEvents>[0]);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// CSV export — same filters, streamed as text/csv with a download filename.
router.get('/csv', validate(auditQueryDto, 'query'), async (req: AuthRequest, res, next) => {
  try {
    const events = await audit.listAuditEvents(req.query as unknown as Parameters<typeof audit.listAuditEvents>[0]);
    const csv = audit.toCsv(events);
    const filename = `checkpoint-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
