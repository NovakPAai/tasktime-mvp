import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateTeamDto, UpdateTeamDto } from './teams.dto.js';

export async function listTeams() {
  return prisma.team.findMany({
    include: {
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTeam(id: string) {
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });
  if (!team) throw new AppError(404, 'Team not found');
  return team;
}

export async function createTeam(dto: CreateTeamDto) {
  return prisma.team.create({
    data: {
      name: dto.name,
      description: dto.description,
    },
  });
}

export async function updateTeam(id: string, dto: UpdateTeamDto) {
  const existing = await prisma.team.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Team not found');

  return prisma.team.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
    },
  });
}

export async function deleteTeam(id: string) {
  const existing = await prisma.team.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Team not found');

  await prisma.teamMember.deleteMany({ where: { teamId: id } });
  await prisma.team.delete({ where: { id } });
}

export async function setTeamMembers(teamId: string, userIds: string[]) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new AppError(404, 'Team not found');

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  if (users.length !== userIds.length) {
    throw new AppError(400, 'Some users not found');
  }

  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamId } }),
    prisma.teamMember.createMany({
      data: userIds.map((userId) => ({ teamId, userId })),
    }),
  ]);
}

