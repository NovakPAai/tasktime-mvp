import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { updateUserDto, changeRoleDto } from './users.dto.js';
import * as usersService from './users.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const users = await usersService.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await usersService.getUser(req.params.id as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateUserDto), async (req: AuthRequest, res, next) => {
  try {
    const user = await usersService.updateUser(req.params.id as string, req.body);
    await logAudit(req, 'user.updated', 'user', req.params.id as string, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/role', requireRole('ADMIN'), validate(changeRoleDto), async (req: AuthRequest, res, next) => {
  try {
    const user = await usersService.changeRole({
      userId: req.user!.userId,
      role: req.user!.role,
    }, req.params.id as string, req.body);
    await logAudit(req, 'user.role_changed', 'user', req.params.id as string, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/deactivate', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const user = await usersService.deactivateUser(req.params.id as string);
    await logAudit(req, 'user.deactivated', 'user', req.params.id as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
