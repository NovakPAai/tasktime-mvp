import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createTeamDto, updateTeamDto, updateMembersDto } from './teams.dto.js';
import * as teamsService from './teams.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);

router.get('/teams', asyncHandler(async (_req, res) => {
  const teams = await teamsService.listTeams();
  res.json(teams);
}));

router.get('/teams/:id', asyncHandler(async (req, res) => {
  const team = await teamsService.getTeam(req.params.id as string);
  res.json(team);
}));

router.post(
  '/teams',
  requireRole('ADMIN'),
  validate(createTeamDto),
  authHandler(async (req, res) => {
    const team = await teamsService.createTeam(req.body);
    await logAudit(req, 'team.created', 'team', team.id, req.body);
    res.status(201).json(team);
  })
);

router.patch(
  '/teams/:id',
  requireRole('ADMIN'),
  validate(updateTeamDto),
  authHandler(async (req, res) => {
    const team = await teamsService.updateTeam(req.params.id as string, req.body);
    await logAudit(req, 'team.updated', 'team', team.id, req.body);
    res.json(team);
  })
);

router.delete('/teams/:id', requireRole('ADMIN'), authHandler(async (req, res) => {
  await teamsService.deleteTeam(req.params.id as string);
  await logAudit(req, 'team.deleted', 'team', req.params.id as string);
  res.status(204).send();
}));

router.put(
  '/teams/:id/members',
  requireRole('ADMIN'),
  validate(updateMembersDto),
  authHandler(async (req, res) => {
    await teamsService.setTeamMembers(req.params.id as string, req.body.userIds);
    await logAudit(req, 'team.members_updated', 'team', req.params.id as string, {
      userIds: req.body.userIds,
    });
    res.json({ ok: true });
  })
);

export default router;
