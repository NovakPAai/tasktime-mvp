import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCategoryDto, updateCategoryDto } from './project-categories.dto.js';
import * as categoriesService from './project-categories.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const categories = await categoriesService.listCategories();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), validate(createCategoryDto), async (req: AuthRequest, res, next) => {
  try {
    const category = await categoriesService.createCategory(req.body);
    await logAudit(req, 'project_category.created', 'project_category', category.id, req.body);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireRole('ADMIN'), validate(updateCategoryDto), async (req: AuthRequest, res, next) => {
  try {
    const category = await categoriesService.updateCategory(req.params.id as string, req.body);
    await logAudit(req, 'project_category.updated', 'project_category', req.params.id as string, req.body);
    res.json(category);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    await categoriesService.deleteCategory(req.params.id as string);
    await logAudit(req, 'project_category.deleted', 'project_category', req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
