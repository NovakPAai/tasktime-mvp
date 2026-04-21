import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCategoryDto, updateCategoryDto } from './project-categories.dto.js';
import * as categoriesService from './project-categories.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
  const categories = await categoriesService.listCategories();
  res.json(categories);
}));

router.post('/', requireRole('ADMIN'), validate(createCategoryDto), authHandler(async (req, res) => {
  const category = await categoriesService.createCategory(req.body);
  await logAudit(req, 'project_category.created', 'project_category', category.id, req.body);
  res.status(201).json(category);
}));

router.patch('/:id', requireRole('ADMIN'), validate(updateCategoryDto), authHandler(async (req, res) => {
  const category = await categoriesService.updateCategory(req.params.id as string, req.body);
  await logAudit(req, 'project_category.updated', 'project_category', req.params.id as string, req.body);
  res.json(category);
}));

router.delete('/:id', requireRole('ADMIN'), authHandler(async (req, res) => {
  await categoriesService.deleteCategory(req.params.id as string);
  await logAudit(req, 'project_category.deleted', 'project_category', req.params.id as string);
  res.status(204).send();
}));

export default router;
