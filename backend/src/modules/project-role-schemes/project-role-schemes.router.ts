import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createSchemeDto,
  updateSchemeDto,
  createRoleDefinitionDto,
  updateRoleDefinitionDto,
  updatePermissionsDto,
  attachProjectDto,
} from './project-role-schemes.dto.js';
import * as service from './project-role-schemes.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try { res.json(await service.listSchemes()); } catch (err) { next(err); }
});

router.post('/', validate(createSchemeDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.createScheme(req.body);
    await logAudit(req, 'role_scheme.created', 'role_scheme', scheme.id, req.body);
    res.status(201).json(scheme);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await service.getScheme(req.params.id as string)); } catch (err) { next(err); }
});

router.patch('/:id', validate(updateSchemeDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.updateScheme(req.params.id as string, req.body);
    await logAudit(req, 'role_scheme.updated', 'role_scheme', req.params.id as string, req.body);
    res.json(scheme);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteScheme(req.params.id as string);
    await logAudit(req, 'role_scheme.deleted', 'role_scheme', req.params.id as string);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/projects', validate(attachProjectDto), async (req: AuthRequest, res, next) => {
  try {
    const { binding, created } = await service.attachProject(req.params.id as string, req.body.projectId);
    await logAudit(req, 'role_scheme.project_attached', 'role_scheme', req.params.id as string, req.body);
    res.status(created ? 201 : 200).json(binding);
  } catch (err) { next(err); }
});

router.delete('/:id/projects/:projectId', async (req: AuthRequest, res, next) => {
  try {
    await service.detachProject(req.params.id as string, req.params.projectId as string);
    await logAudit(req, 'role_scheme.project_detached', 'role_scheme', req.params.id as string, { projectId: req.params.projectId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/roles', async (req, res, next) => {
  try { res.json(await service.listRoles(req.params.id as string)); } catch (err) { next(err); }
});

router.post('/:id/roles', validate(createRoleDefinitionDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await service.createRole(req.params.id as string, req.body);
    await logAudit(req, 'role_scheme.role_created', 'role_scheme', req.params.id as string, req.body);
    res.status(201).json(role);
  } catch (err) { next(err); }
});

router.patch('/:id/roles/:roleId', validate(updateRoleDefinitionDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await service.updateRole(req.params.id as string, req.params.roleId as string, req.body);
    await logAudit(req, 'role_scheme.role_updated', 'role_scheme', req.params.id as string, { roleId: req.params.roleId, ...req.body });
    res.json(role);
  } catch (err) { next(err); }
});

router.delete('/:id/roles/:roleId', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteRole(req.params.id as string, req.params.roleId as string);
    await logAudit(req, 'role_scheme.role_deleted', 'role_scheme', req.params.id as string, { roleId: req.params.roleId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/roles/:roleId/permissions', async (req, res, next) => {
  try {
    res.json(await service.getPermissions(req.params.id as string, req.params.roleId as string));
  } catch (err) { next(err); }
});

// PATCH is correct: we accept a partial permissions map and merge it; PUT would imply full replacement.
router.patch('/:id/roles/:roleId/permissions', validate(updatePermissionsDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await service.updatePermissions(req.params.id as string, req.params.roleId as string, req.body);
    await logAudit(req, 'role_scheme.permissions_updated', 'role_scheme', req.params.id as string, { roleId: req.params.roleId, permissions: req.body.permissions });
    res.json(role);
  } catch (err) { next(err); }
});

export default router;
