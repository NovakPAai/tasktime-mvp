import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createFieldSchemaDto,
  updateFieldSchemaDto,
  copyFieldSchemaDto,
  addFieldSchemaItemDto,
  reorderFieldSchemaItemsDto,
  replaceFieldSchemaItemsDto,
  createFieldSchemaBindingDto,
} from './field-schemas.dto.js';
import * as service from './field-schemas.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router({ mergeParams: true });

// ===== Admin routes: /api/admin/field-schemas =====

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

adminRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listFieldSchemas());
}));

adminRouter.post('/', validate(createFieldSchemaDto), authHandler(async (req, res) => {
  const schema = await service.createFieldSchema(req.body);
  await logAudit(req, 'field_schema.created', 'field_schema', schema.id, req.body);
  res.status(201).json(schema);
}));

adminRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getFieldSchema(req.params.id as string));
}));

adminRouter.patch('/:id', validate(updateFieldSchemaDto), authHandler(async (req, res) => {
  const schema = await service.updateFieldSchema(req.params.id as string, req.body);
  await logAudit(req, 'field_schema.updated', 'field_schema', req.params.id as string, req.body);
  res.json(schema);
}));

adminRouter.delete('/:id', authHandler(async (req, res) => {
  await service.deleteFieldSchema(req.params.id as string);
  await logAudit(req, 'field_schema.deleted', 'field_schema', req.params.id as string);
  res.json({ ok: true });
}));

adminRouter.post('/:id/copy', validate(copyFieldSchemaDto), authHandler(async (req, res) => {
  const copy = await service.copyFieldSchema(req.params.id as string, req.body);
  await logAudit(req, 'field_schema.copied', 'field_schema', req.params.id as string, req.body);
  res.status(201).json(copy);
}));

adminRouter.get('/:id/conflicts', asyncHandler(async (req, res) => {
  const result = await service.checkConflicts(req.params.id as string);
  res.json(result);
}));

adminRouter.post('/:id/publish', authHandler(async (req, res, next) => {
  try {
    const result = await service.publishFieldSchema(req.params.id as string);
    await logAudit(req, 'field_schema.published', 'field_schema', req.params.id as string);
    res.json(result);
  } catch (err: unknown) {
    // If publish was blocked by conflicts, include them in the 422 response
    if (
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      (err as { statusCode: number }).statusCode === 422 &&
      'conflicts' in err
    ) {
      res.status(422).json({
        error: (err as unknown as { message: string }).message,
        conflicts: (err as { conflicts: unknown }).conflicts,
      });
      return;
    }
    next(err);
  }
}));

adminRouter.post('/:id/unpublish', authHandler(async (req, res) => {
  const schema = await service.unpublishFieldSchema(req.params.id as string);
  await logAudit(req, 'field_schema.unpublished', 'field_schema', req.params.id as string);
  res.json(schema);
}));

adminRouter.patch('/:id/set-default', authHandler(async (req, res) => {
  const schema = await service.setDefaultFieldSchema(req.params.id as string);
  await logAudit(req, 'field_schema.set_default', 'field_schema', req.params.id as string);
  res.json(schema);
}));

// Items
adminRouter.put('/:id/items', validate(replaceFieldSchemaItemsDto), authHandler(async (req, res) => {
  const schema = await service.replaceFieldSchemaItems(req.params.id as string, req.body);
  await logAudit(req, 'field_schema.items_replaced', 'field_schema', req.params.id as string, req.body);
  res.json(schema);
}));

adminRouter.post('/:id/items', validate(addFieldSchemaItemDto), authHandler(async (req, res) => {
  const item = await service.addFieldSchemaItem(req.params.id as string, req.body);
  await logAudit(req, 'field_schema.item_added', 'field_schema', req.params.id as string, req.body);
  res.status(201).json(item);
}));

adminRouter.delete('/:id/items/:itemId', authHandler(async (req, res) => {
  await service.removeFieldSchemaItem(req.params.id as string, req.params.itemId as string);
  await logAudit(req, 'field_schema.item_removed', 'field_schema', req.params.id as string, { itemId: req.params.itemId });
  res.json({ ok: true });
}));

adminRouter.patch('/:id/items/reorder', validate(reorderFieldSchemaItemsDto), authHandler(async (req, res) => {
  await service.reorderFieldSchemaItems(req.params.id as string, req.body);
  await logAudit(req, 'field_schema.items_reordered', 'field_schema', req.params.id as string, req.body);
  res.json({ ok: true });
}));

// Bindings
adminRouter.get('/:id/bindings', asyncHandler(async (req, res) => {
  res.json(await service.listFieldSchemaBindings(req.params.id as string));
}));

adminRouter.post('/:id/bindings', validate(createFieldSchemaBindingDto), authHandler(async (req, res) => {
  const binding = await service.addFieldSchemaBinding(req.params.id as string, req.body);
  await logAudit(req, 'field_schema.binding_added', 'field_schema', req.params.id as string, req.body);
  res.status(201).json(binding);
}));

adminRouter.delete('/:id/bindings/:bindingId', authHandler(async (req, res) => {
  await service.removeFieldSchemaBinding(req.params.id as string, req.params.bindingId as string);
  await logAudit(req, 'field_schema.binding_removed', 'field_schema', req.params.id as string, { bindingId: req.params.bindingId });
  res.json({ ok: true });
}));

// ===== Public route: GET /api/projects/:projectId/field-schemas =====

const projectFieldSchemasRouter = Router({ mergeParams: true });
projectFieldSchemasRouter.use(authenticate);

projectFieldSchemasRouter.get('/', authHandler(async (req, res) => {
  const projectId = (req.params as Record<string, string>)['projectId'] as string;
  const { issueTypeConfigId } = req.query as { issueTypeConfigId?: string };
  res.json(await service.listProjectFieldSchemas(projectId, issueTypeConfigId));
}));

export { adminRouter, projectFieldSchemasRouter };
export default router;
