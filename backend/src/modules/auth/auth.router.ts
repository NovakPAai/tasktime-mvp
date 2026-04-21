import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { registerDto, loginDto, refreshDto } from './auth.dto.js';
import * as authService from './auth.service.js';
import { getRegistrationSetting } from '../admin/admin.service.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';
import { rateLimit, RATE_LIMITS } from '../../shared/middleware/rate-limit.js';

const router = Router();

// Public endpoint — no auth required, used by login page
router.get('/registration-status', rateLimit(RATE_LIMITS.authRead), asyncHandler(async (_req, res) => {
  const registrationEnabled = await getRegistrationSetting();
  res.json({ registrationEnabled });
}));

router.post('/register', rateLimit(RATE_LIMITS.authWrite), validate(registerDto), asyncHandler(async (req, res) => {
  const registrationEnabled = await getRegistrationSetting();
  if (!registrationEnabled) {
    throw new AppError(403, 'Регистрация пользователей отключена');
  }
  const result = await authService.register(req.body);
  res.status(201).json(result);
}));

router.post('/login', rateLimit(RATE_LIMITS.authWrite), validate(loginDto), asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
}));

router.post('/refresh', rateLimit(RATE_LIMITS.authWrite), validate(refreshDto), asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  res.json(result);
}));

router.post('/logout', rateLimit(RATE_LIMITS.authWrite), asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  res.json({ message: 'Logged out' });
}));

router.get('/me', authenticate, authHandler(async (req, res) => {
  const user = await authService.getMe(req.user!.userId);
  res.json(user);
}));

router.post('/change-password', rateLimit(RATE_LIMITS.authWrite), authenticate, authHandler(async (req, res) => {
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
}));

export default router;
