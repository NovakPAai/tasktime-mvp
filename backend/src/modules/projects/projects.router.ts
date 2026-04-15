import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createProjectDto, updateProjectDto } from './projects.dto.js';
import * as projectsService from './projects.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    if (req.query.withDashboard === 'true') {
      const projects = await projectsService.listProjectsWithDashboardsForUser(user.userId, user.systemRoles);
      res.json(projects);
    } else {
      const projects = await projectsService.listProjectsForUser(user.userId, user.systemRoles);
      res.json(projects);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), validate(createProjectDto), async (req: AuthRequest, res, next) => {
  try {
    const project = await projectsService.createProject(req.body);
    await logAudit(req, 'project.created', 'project', project.id, req.body);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    await projectsService.checkProjectAccess(req.params.id as string, user.userId, user.systemRoles);
    const project = await projectsService.getProject(req.params.id as string);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/dashboard', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    await projectsService.checkProjectAccess(req.params.id as string, user.userId, user.systemRoles);
    const dashboard = await projectsService.getProjectDashboard(req.params.id as string);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireRole('ADMIN'), validate(updateProjectDto), async (req: AuthRequest, res, next) => {
  try {
    const project = await projectsService.updateProject(req.params.id as string, req.body);
    await logAudit(req, 'project.updated', 'project', req.params.id as string, req.body);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    await projectsService.deleteProject(req.params.id as string);
    await logAudit(req, 'project.deleted', 'project', req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
