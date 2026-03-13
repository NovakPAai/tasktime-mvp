import { prisma } from '../../prisma/client.js';
import { deleteUserSession } from '../../shared/redis.js';
import { hashPassword } from '../../shared/utils/password.js';
import { AppError } from '../../shared/middleware/error-handler.js';

type RotateUserPasswordInput = {
  email: string;
  newPassword: string;
};

export async function rotateUserPassword({ email, newPassword }: RotateUserPasswordInput) {
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
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const passwordHash = await hashPassword(trimmedPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  await deleteUserSession(user.id);

  return user;
}
