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
    select: {
      id: true,
      email: true,
      systemRoles: { select: { role: true } },
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const currentRoles = user.systemRoles.map((sr) => sr.role);

  // Add SUPER_ADMIN role if not already present; ensure USER role exists
  await prisma.$transaction([
    ...(currentRoles.includes('SUPER_ADMIN')
      ? []
      : [prisma.userSystemRole.create({ data: { userId: user.id, role: 'SUPER_ADMIN' } })]),
    ...(currentRoles.includes('USER')
      ? []
      : [prisma.userSystemRole.create({ data: { userId: user.id, role: 'USER' } })]),
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);

  await deleteUserSession(user.id);

  return {
    id: user.id,
    email: user.email,
    systemRoles: [...new Set([...currentRoles, 'SUPER_ADMIN', 'USER'])] as typeof currentRoles,
  };
}
