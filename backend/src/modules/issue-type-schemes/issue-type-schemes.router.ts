import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  assignProjectDto,
  createIssueTypeSchemeDto,
  updateIssueTypeSchemeDto,
  updateSchemeItemsDto,
} from './issue-type-schemes.dto.js';
import * as service from './issue-type-schemes.service.js';

const router = Router();
router.use(authenticate);

// GET /admin/issue-type-schemes
router.get('/admin/issue-type-schemes', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await service.listSchemes());
  } catch (err) { next(err); }
});

// GET /admin/issue-type-schemes/:id
router.get('/admin/issue-type-schemes/:id', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await service.getScheme(req.params.id as string));
  } catch (err) { next(err); }
});

// POST /admin/issue-type-schemes
router.post('/admin/issue-type-schemes', requireRole('ADMIN', 'SUPER_ADMIN'), validate(createIssueTypeSchemeDto), async (req, res, next) => {
  try {
    res.status(201).json(await service.createScheme(req.body));
  } catch (err) { next(err); }
});

// PUT /admin/issue-type-schemes/:id
router.put('/admin/issue-type-schemes/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateIssueTypeSchemeDto), async (req, res, next) => {
  try {
    res.json(await service.updateScheme(req.params.id as string, req.body));
  } catch (err) { next(err); }
});

// DELETE /admin/issue-type-schemes/:id
router.delete('/admin/issue-type-schemes/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    await service.deleteScheme(req.params.id as string);
    res.status(204).send();
  } catch (err) { next(err); }
});

// PUT /admin/issue-type-schemes/:id/items — replace items list
router.put('/admin/issue-type-schemes/:id/items', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateSchemeItemsDto), async (req, res, next) => {
  try {
    res.json(await service.updateSchemeItems(req.params.id as string, req.body.items));
  } catch (err) { next(err); }
});

// POST /admin/issue-type-schemes/:id/projects — assign project to scheme
router.post('/admin/issue-type-schemes/:id/projects', requireRole('ADMIN', 'SUPER_ADMIN'), validate(assignProjectDto), async (req, res, next) => {
  try {
    res.status(201).json(await service.assignProjectToScheme(req.params.id as string, req.body.projectId));
  } catch (err) { next(err); }
});

// DELETE /admin/issue-type-schemes/:id/projects/:projectId — remove project from scheme
router.delete('/admin/issue-type-schemes/:id/projects/:projectId', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    await service.removeProjectFromScheme(req.params.id as string, req.params.projectId as string);
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /projects/:id/issue-types — types available for a project
router.get('/projects/:id/issue-types', async (req, res, next) => {
  try {
    res.json(await service.getProjectIssueTypes(req.params.id as string));
  } catch (err) { next(err); }
});

export default router;
