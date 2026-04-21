import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createProjectDto, updateProjectDto } from './projects.dto.js';
import * as projectsService from './projects.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);

router.get('/', authHandler(async (req, res) => {
  const user = req.user!;
  if (req.query.withDashboard === 'true') {
    const projects = await projectsService.listProjectsWithDashboardsForUser(user.userId, user.systemRoles);
    res.json(projects);
  } else {
    const projects = await projectsService.listProjectsForUser(user.userId, user.systemRoles);
    res.json(projects);
  }
}));

router.post('/', requireRole('ADMIN'), validate(createProjectDto), authHandler(async (req, res) => {
  const project = await projectsService.createProject(req.body);
  await logAudit(req, 'project.created', 'project', project.id, req.body);
  res.status(201).json(project);
}));

router.get('/:id', authHandler(async (req, res) => {
  const user = req.user!;
  await projectsService.checkProjectAccess(req.params.id as string, user.userId, user.systemRoles);
  const project = await projectsService.getProject(req.params.id as string);
  res.json(project);
}));

router.get('/:id/dashboard', authHandler(async (req, res) => {
  const user = req.user!;
  await projectsService.checkProjectAccess(req.params.id as string, user.userId, user.systemRoles);
  const dashboard = await projectsService.getProjectDashboard(req.params.id as string);
  res.json(dashboard);
}));

router.patch('/:id', requireRole('ADMIN'), validate(updateProjectDto), authHandler(async (req, res) => {
  const project = await projectsService.updateProject(req.params.id as string, req.body);
  await logAudit(req, 'project.updated', 'project', req.params.id as string, req.body);
  res.json(project);
}));

router.delete('/:id', requireRole('ADMIN'), authHandler(async (req, res) => {
  await projectsService.deleteProject(req.params.id as string);
  await logAudit(req, 'project.deleted', 'project', req.params.id as string);
  res.status(204).send();
}));

export default router;
