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

router.get('/', async (_req, res, next) => {
  try {
    const projects = await projectsService.listProjects();
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN', 'MANAGER'), validate(createProjectDto), async (req: AuthRequest, res, next) => {
  try {
    const project = await projectsService.createProject(req.body);
    await logAudit(req, 'project.created', 'project', project.id, req.body);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = await projectsService.getProject(req.params.id as string);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/dashboard', async (req, res, next) => {
  try {
    const dashboard = await projectsService.getProjectDashboard(req.params.id as string);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(updateProjectDto), async (req: AuthRequest, res, next) => {
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
