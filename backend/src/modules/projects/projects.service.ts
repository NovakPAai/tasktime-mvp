import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';

export async function listProjects() {
  return prisma.project.findMany({
    include: { _count: { select: { issues: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { _count: { select: { issues: true } } },
  });
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

export async function createProject(dto: CreateProjectDto) {
  const existing = await prisma.project.findUnique({ where: { key: dto.key } });
  if (existing) throw new AppError(409, 'Project key already exists');

  return prisma.project.create({ data: dto });
}

export async function updateProject(id: string, dto: UpdateProjectDto) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError(404, 'Project not found');

  return prisma.project.update({ where: { id }, data: dto });
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError(404, 'Project not found');

  await prisma.project.delete({ where: { id } });
}
