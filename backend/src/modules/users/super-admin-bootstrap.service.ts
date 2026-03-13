import { prisma } from '../../prisma/client.js';
import { deleteUserSession } from '../../shared/redis.js';
import { AppError } from '../../shared/middleware/error-handler.js';

type PromoteUserToSuperAdminInput = {
  email: string;
};

export async function promoteUserToSuperAdmin({ email }: PromoteUserToSuperAdminInput) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new AppError(400, 'Email is required');
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { role: 'SUPER_ADMIN' },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  await deleteUserSession(user.id);

  return {
    ...user,
    role: 'SUPER_ADMIN' as const,
  };
}
