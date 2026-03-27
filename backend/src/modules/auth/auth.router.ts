import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { registerDto, loginDto, refreshDto } from './auth.dto.js';
import * as authService from './auth.service.js';
import { getRegistrationSetting } from '../admin/admin.service.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

// Public endpoint — no auth required, used by login page
router.get('/registration-status', async (_req, res, next) => {
  try {
    const registrationEnabled = await getRegistrationSetting();
    res.json({ registrationEnabled });
  } catch (err) {
    next(err);
  }
});

router.post('/register', validate(registerDto), async (req, res, next) => {
  try {
    const registrationEnabled = await getRegistrationSetting();
    if (!registrationEnabled) {
      throw new AppError(403, 'Регистрация пользователей отключена');
    }
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginDto), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', validate(refreshDto), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' });
      return;
    }
    // CVE-11: enforce password policy
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
      return;
    }
    if (!/\d/.test(newPassword)) {
      res.status(400).json({ error: 'Password must contain at least one digit' });
      return;
    }
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
