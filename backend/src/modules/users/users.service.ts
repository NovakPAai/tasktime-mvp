import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { UpdateUserDto, ChangeRoleDto } from './users.dto.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function listUsers() {
  return prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

export async function updateUser(id: string, dto: UpdateUserDto) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  if (dto.email && dto.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new AppError(409, 'Email already in use');
  }

  return prisma.user.update({ where: { id }, data: dto, select: userSelect });
}

export async function changeRole(id: string, dto: ChangeRoleDto) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  return prisma.user.update({
    where: { id },
    data: { role: dto.role },
    select: userSelect,
  });
}

export async function deactivateUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: userSelect,
  });
}
