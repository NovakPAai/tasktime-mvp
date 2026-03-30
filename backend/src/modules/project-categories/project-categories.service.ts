import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './project-categories.dto.js';

const categoryInclude = {
  projects: { select: { id: true, name: true, key: true } },
} as const;

export async function listCategories() {
  return prisma.projectCategory.findMany({
    include: categoryInclude,
    orderBy: { name: 'asc' },
  });
}

export async function getCategory(id: string) {
  const category = await prisma.projectCategory.findUnique({
    where: { id },
    include: categoryInclude,
  });
  if (!category) throw new AppError(404, 'Category not found');
  return category;
}

export async function createCategory(dto: CreateCategoryDto) {
  const existing = await prisma.projectCategory.findUnique({ where: { name: dto.name } });
  if (existing) throw new AppError(409, 'Category name already exists');

  return prisma.projectCategory.create({ data: dto, include: categoryInclude });
}

export async function updateCategory(id: string, dto: UpdateCategoryDto) {
  const category = await prisma.projectCategory.findUnique({ where: { id } });
  if (!category) throw new AppError(404, 'Category not found');

  if (dto.name && dto.name !== category.name) {
    const existing = await prisma.projectCategory.findUnique({ where: { name: dto.name } });
    if (existing) throw new AppError(409, 'Category name already exists');
  }

  return prisma.projectCategory.update({ where: { id }, data: dto, include: categoryInclude });
}

export async function deleteCategory(id: string) {
  const category = await prisma.projectCategory.findUnique({ where: { id } });
  if (!category) throw new AppError(404, 'Category not found');

  await prisma.projectCategory.delete({ where: { id } });
}
