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
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router({ mergeParams: true });

// ===== Admin routes: /api/admin/field-schemas =====

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

adminRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listFieldSchemas());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/', validate(createFieldSchemaDto), async (req: AuthRequest, res, next) => {
  try {
    const schema = await service.createFieldSchema(req.body);
    await logAudit(req, 'field_schema.created', 'field_schema', schema.id, req.body);
    res.status(201).json(schema);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getFieldSchema(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/:id', validate(updateFieldSchemaDto), async (req: AuthRequest, res, next) => {
  try {
    const schema = await service.updateFieldSchema(req.params.id as string, req.body);
    await logAudit(req, 'field_schema.updated', 'field_schema', req.params.id as string, req.body);
    res.json(schema);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteFieldSchema(req.params.id as string);
    await logAudit(req, 'field_schema.deleted', 'field_schema', req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/copy', validate(copyFieldSchemaDto), async (req: AuthRequest, res, next) => {
  try {
    const copy = await service.copyFieldSchema(req.params.id as string, req.body);
    await logAudit(req, 'field_schema.copied', 'field_schema', req.params.id as string, req.body);
    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/publish', async (req: AuthRequest, res, next) => {
  try {
    const schema = await service.publishFieldSchema(req.params.id as string);
    await logAudit(req, 'field_schema.published', 'field_schema', req.params.id as string);
    res.json(schema);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/unpublish', async (req: AuthRequest, res, next) => {
  try {
    const schema = await service.unpublishFieldSchema(req.params.id as string);
    await logAudit(req, 'field_schema.unpublished', 'field_schema', req.params.id as string);
    res.json(schema);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/:id/set-default', async (req: AuthRequest, res, next) => {
  try {
    const schema = await service.setDefaultFieldSchema(req.params.id as string);
    await logAudit(req, 'field_schema.set_default', 'field_schema', req.params.id as string);
    res.json(schema);
  } catch (err) {
    next(err);
  }
});

// Items
adminRouter.put('/:id/items', validate(replaceFieldSchemaItemsDto), async (req: AuthRequest, res, next) => {
  try {
    const schema = await service.replaceFieldSchemaItems(req.params.id as string, req.body);
    await logAudit(req, 'field_schema.items_replaced', 'field_schema', req.params.id as string, req.body);
    res.json(schema);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/items', validate(addFieldSchemaItemDto), async (req: AuthRequest, res, next) => {
  try {
    const item = await service.addFieldSchemaItem(req.params.id as string, req.body);
    await logAudit(req, 'field_schema.item_added', 'field_schema', req.params.id as string, req.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/:id/items/:itemId', async (req: AuthRequest, res, next) => {
  try {
    await service.removeFieldSchemaItem(req.params.id as string, req.params.itemId as string);
    await logAudit(req, 'field_schema.item_removed', 'field_schema', req.params.id as string, { itemId: req.params.itemId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/:id/items/reorder', validate(reorderFieldSchemaItemsDto), async (req: AuthRequest, res, next) => {
  try {
    await service.reorderFieldSchemaItems(req.params.id as string, req.body);
    await logAudit(req, 'field_schema.items_reordered', 'field_schema', req.params.id as string, req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Bindings
adminRouter.get('/:id/bindings', async (req, res, next) => {
  try {
    res.json(await service.listFieldSchemaBindings(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/:id/bindings', validate(createFieldSchemaBindingDto), async (req: AuthRequest, res, next) => {
  try {
    const binding = await service.addFieldSchemaBinding(req.params.id as string, req.body);
    await logAudit(req, 'field_schema.binding_added', 'field_schema', req.params.id as string, req.body);
    res.status(201).json(binding);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/:id/bindings/:bindingId', async (req: AuthRequest, res, next) => {
  try {
    await service.removeFieldSchemaBinding(req.params.id as string, req.params.bindingId as string);
    await logAudit(req, 'field_schema.binding_removed', 'field_schema', req.params.id as string, { bindingId: req.params.bindingId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ===== Public route: GET /api/projects/:projectId/field-schemas =====

const projectFieldSchemasRouter = Router({ mergeParams: true });
projectFieldSchemasRouter.use(authenticate);

projectFieldSchemasRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const projectId = (req.params as Record<string, string>)['projectId'] as string;
    res.json(await service.listProjectFieldSchemas(projectId));
  } catch (err) {
    next(err);
  }
});

export { adminRouter, projectFieldSchemasRouter };
export default router;
