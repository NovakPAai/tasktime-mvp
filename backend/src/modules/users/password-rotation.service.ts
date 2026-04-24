import { prisma } from '../../prisma/client.js';
import { deleteUserSession } from '../../shared/redis.js';
import { hashPassword } from '../../shared/utils/password.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { captureError } from '../../shared/utils/logger.js';

type RotateUserPasswordInput = {
  email: string;
  newPassword: string;
  /**
   * Очистить `mustChangePassword` флаг. По умолчанию `false` — backward-compat
   * с существующим `POST /admin/users/reset-password` (ADMIN set temp password,
   * force user change on next login).
   *
   * CLI-скрипт `rotate-password.ts` передаёт `true` — это постоянный пароль,
   * выбранный самим пользователем / автоматизацией (E2E setup).
   */
  clearMustChangePassword?: boolean;
};

export async function rotateUserPassword({
  email,
  newPassword,
  clearMustChangePassword = false,
}: RotateUserPasswordInput) {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedPassword = newPassword.trim();

  if (!normalizedEmail) {
    throw new AppError(400, 'Email is required');
  }

  if (trimmedPassword.length < 8) {
    throw new AppError(400, 'New password must be at least 8 characters long');
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const passwordHash = await hashPassword(trimmedPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: clearMustChangePassword
        ? { passwordHash, mustChangePassword: false }
        : { passwordHash },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  // Redis-failure не-fatal: DB уже committed, stale session отработает до
  // idle-timeout. Альтернатива — throw после committed write — оставляет систему
  // в несогласованном состоянии.
  try {
    await deleteUserSession(user.id);
  } catch (err) {
    captureError(err, { fn: 'rotateUserPassword.deleteUserSession', userId: user.id });
  }

  return user;
}
