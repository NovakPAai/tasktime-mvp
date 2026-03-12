import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createTeamDto, updateTeamDto, updateMembersDto } from './teams.dto.js';
import * as teamsService from './teams.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

router.get('/teams', async (_req, res, next) => {
  try {
    const teams = await teamsService.listTeams();
    res.json(teams);
  } catch (err) {
    next(err);
  }
});

router.get('/teams/:id', async (req, res, next) => {
  try {
    const team = await teamsService.getTeam(req.params.id as string);
    res.json(team);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/teams',
  requireRole('ADMIN', 'MANAGER'),
  validate(createTeamDto),
  async (req: AuthRequest, res, next) => {
    try {
      const team = await teamsService.createTeam(req.body);
      await logAudit(req, 'team.created', 'team', team.id, req.body);
      res.status(201).json(team);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/teams/:id',
  requireRole('ADMIN', 'MANAGER'),
  validate(updateTeamDto),
  async (req: AuthRequest, res, next) => {
    try {
      const team = await teamsService.updateTeam(req.params.id as string, req.body);
      await logAudit(req, 'team.updated', 'team', team.id, req.body);
      res.json(team);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/teams/:id', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    await teamsService.deleteTeam(req.params.id as string);
    await logAudit(req, 'team.deleted', 'team', req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.put(
  '/teams/:id/members',
  requireRole('ADMIN', 'MANAGER'),
  validate(updateMembersDto),
  async (req: AuthRequest, res, next) => {
    try {
      await teamsService.setTeamMembers(req.params.id as string, req.body.userIds);
      await logAudit(req, 'team.members_updated', 'team', req.params.id as string, {
        userIds: req.body.userIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

