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
import { asyncHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

// GET /admin/issue-type-schemes
router.get('/admin/issue-type-schemes', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  res.json(await service.listSchemes());
}));

// GET /admin/issue-type-schemes/:id
router.get('/admin/issue-type-schemes/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  res.json(await service.getScheme(req.params.id as string));
}));

// POST /admin/issue-type-schemes
router.post('/admin/issue-type-schemes', requireRole('ADMIN', 'SUPER_ADMIN'), validate(createIssueTypeSchemeDto), asyncHandler(async (req, res) => {
  res.status(201).json(await service.createScheme(req.body));
}));

// PUT /admin/issue-type-schemes/:id
router.put('/admin/issue-type-schemes/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateIssueTypeSchemeDto), asyncHandler(async (req, res) => {
  res.json(await service.updateScheme(req.params.id as string, req.body));
}));

// DELETE /admin/issue-type-schemes/:id
router.delete('/admin/issue-type-schemes/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  await service.deleteScheme(req.params.id as string);
  res.status(204).send();
}));

// PUT /admin/issue-type-schemes/:id/items — replace items list
router.put('/admin/issue-type-schemes/:id/items', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateSchemeItemsDto), asyncHandler(async (req, res) => {
  res.json(await service.updateSchemeItems(req.params.id as string, req.body.items));
}));

// POST /admin/issue-type-schemes/:id/projects — assign project to scheme
router.post('/admin/issue-type-schemes/:id/projects', requireRole('ADMIN', 'SUPER_ADMIN'), validate(assignProjectDto), asyncHandler(async (req, res) => {
  res.status(201).json(await service.assignProjectToScheme(req.params.id as string, req.body.projectId));
}));

// DELETE /admin/issue-type-schemes/:id/projects/:projectId — remove project from scheme
router.delete('/admin/issue-type-schemes/:id/projects/:projectId', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  await service.removeProjectFromScheme(req.params.id as string, req.params.projectId as string);
  res.status(204).send();
}));

// GET /projects/:id/issue-types — types available for a project
router.get('/projects/:id/issue-types', asyncHandler(async (req, res) => {
  res.json(await service.getProjectIssueTypes(req.params.id as string));
}));

export default router;
