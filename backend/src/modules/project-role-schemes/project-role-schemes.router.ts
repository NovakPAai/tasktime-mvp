import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireSuperAdmin } from '../../shared/middleware/rbac.js';
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
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
// Role-scheme administration affects the global RBAC matrix for every project and every user —
// scope to SUPER_ADMIN rather than plain ADMIN. Regular ADMIN can still assign per-project roles.
router.use(requireSuperAdmin());

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listSchemes());
}));

router.post('/', validate(createSchemeDto), authHandler(async (req, res) => {
  const scheme = await service.createScheme(req.body);
  await logAudit(req, 'role_scheme.created', 'role_scheme', scheme.id, req.body);
  res.status(201).json(scheme);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getScheme(req.params.id as string));
}));

router.patch('/:id', validate(updateSchemeDto), authHandler(async (req, res) => {
  const scheme = await service.updateScheme(req.params.id as string, req.body);
  await logAudit(req, 'role_scheme.updated', 'role_scheme', req.params.id as string, req.body);
  res.json(scheme);
}));

router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteScheme(req.params.id as string);
  await logAudit(req, 'role_scheme.deleted', 'role_scheme', req.params.id as string);
  res.json({ ok: true });
}));

router.post('/:id/projects', validate(attachProjectDto), authHandler(async (req, res) => {
  const { binding, created } = await service.attachProject(req.params.id as string, req.body.projectId);
  await logAudit(req, 'role_scheme.project_attached', 'role_scheme', req.params.id as string, req.body);
  res.status(created ? 201 : 200).json(binding);
}));

router.delete('/:id/projects/:projectId', authHandler(async (req, res) => {
  await service.detachProject(req.params.id as string, req.params.projectId as string);
  await logAudit(req, 'role_scheme.project_detached', 'role_scheme', req.params.id as string, { projectId: req.params.projectId });
  res.json({ ok: true });
}));

router.get('/:id/roles', asyncHandler(async (req, res) => {
  res.json(await service.listRoles(req.params.id as string));
}));

router.post('/:id/roles', validate(createRoleDefinitionDto), authHandler(async (req, res) => {
  const role = await service.createRole(req.params.id as string, req.body);
  await logAudit(req, 'role_scheme.role_created', 'role_scheme', req.params.id as string, req.body);
  res.status(201).json(role);
}));

router.patch('/:id/roles/:roleId', validate(updateRoleDefinitionDto), authHandler(async (req, res) => {
  const role = await service.updateRole(req.params.id as string, req.params.roleId as string, req.body);
  await logAudit(req, 'role_scheme.role_updated', 'role_scheme', req.params.id as string, { roleId: req.params.roleId, ...req.body });
  res.json(role);
}));

router.delete('/:id/roles/:roleId', authHandler(async (req, res) => {
  await service.deleteRole(req.params.id as string, req.params.roleId as string);
  await logAudit(req, 'role_scheme.role_deleted', 'role_scheme', req.params.id as string, { roleId: req.params.roleId });
  res.json({ ok: true });
}));

router.get('/:id/roles/:roleId/permissions', asyncHandler(async (req, res) => {
  res.json(await service.getPermissions(req.params.id as string, req.params.roleId as string));
}));

// PATCH is correct: we accept a partial permissions map and merge it; PUT would imply full replacement.
router.patch('/:id/roles/:roleId/permissions', validate(updatePermissionsDto), authHandler(async (req, res) => {
  const role = await service.updatePermissions(req.params.id as string, req.params.roleId as string, req.body);
  await logAudit(req, 'role_scheme.permissions_updated', 'role_scheme', req.params.id as string, { roleId: req.params.roleId, permissions: req.body.permissions });
  res.json(role);
}));

export default router;
