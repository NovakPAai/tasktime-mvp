import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { createCustomFieldDto, updateCustomFieldDto, reorderCustomFieldsDto } from './custom-fields.dto.js';
import * as service from './custom-fields.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listCustomFields());
}));

router.post('/', validate(createCustomFieldDto), authHandler(async (req, res) => {
  const field = await service.createCustomField(req.body);
  await logAudit(req, 'custom_field.created', 'custom_field', field.id, req.body);
  res.status(201).json(field);
}));

// IMPORTANT: /reorder must be before /:id to avoid "reorder" being captured as an id
router.patch('/reorder', validate(reorderCustomFieldsDto), authHandler(async (req, res) => {
  await service.reorderCustomFields(req.body);
  await logAudit(req, 'custom_field.reordered', 'custom_field', 'bulk', req.body);
  res.json({ ok: true });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getCustomField(req.params.id as string));
}));

router.patch('/:id', validate(updateCustomFieldDto), authHandler(async (req, res) => {
  const field = await service.updateCustomField(req.params.id as string, req.body);
  await logAudit(req, 'custom_field.updated', 'custom_field', req.params.id as string, req.body);
  res.json(field);
}));

router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteCustomField(req.params.id as string);
  await logAudit(req, 'custom_field.deleted', 'custom_field', req.params.id as string);
  res.json({ ok: true });
}));

router.patch('/:id/toggle', authHandler(async (req, res) => {
  const field = await service.toggleCustomField(req.params.id as string);
  await logAudit(req, 'custom_field.toggled', 'custom_field', req.params.id as string, { isEnabled: field.isEnabled });
  res.json(field);
}));

export default router;
