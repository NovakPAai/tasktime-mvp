import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { createCustomFieldDto, updateCustomFieldDto, reorderCustomFieldsDto } from './custom-fields.dto.js';
import * as service from './custom-fields.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listCustomFields());
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createCustomFieldDto), async (req: AuthRequest, res, next) => {
  try {
    const field = await service.createCustomField(req.body);
    await logAudit(req, 'custom_field.created', 'custom_field', field.id, req.body);
    res.status(201).json(field);
  } catch (err) {
    next(err);
  }
});

// IMPORTANT: /reorder must be before /:id to avoid "reorder" being captured as an id
router.patch('/reorder', validate(reorderCustomFieldsDto), async (req: AuthRequest, res, next) => {
  try {
    await service.reorderCustomFields(req.body);
    await logAudit(req, 'custom_field.reordered', 'custom_field', 'bulk', req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getCustomField(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateCustomFieldDto), async (req: AuthRequest, res, next) => {
  try {
    const field = await service.updateCustomField(req.params.id as string, req.body);
    await logAudit(req, 'custom_field.updated', 'custom_field', req.params.id as string, req.body);
    res.json(field);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteCustomField(req.params.id as string);
    await logAudit(req, 'custom_field.deleted', 'custom_field', req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/toggle', async (req: AuthRequest, res, next) => {
  try {
    const field = await service.toggleCustomField(req.params.id as string);
    await logAudit(req, 'custom_field.toggled', 'custom_field', req.params.id as string, { isEnabled: field.isEnabled });
    res.json(field);
  } catch (err) {
    next(err);
  }
});

export default router;
