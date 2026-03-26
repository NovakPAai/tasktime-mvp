import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type {
  CreateTransitionScreenDto,
  UpdateTransitionScreenDto,
  ScreenItemsDto,
} from './transition-screens.dto.js';

const screenInclude = {
  items: {
    include: { customField: true },
    orderBy: { orderIndex: 'asc' as const },
  },
  _count: { select: { transitions: true } },
};

export async function listTransitionScreens() {
  return prisma.transitionScreen.findMany({
    orderBy: { createdAt: 'asc' },
    include: screenInclude,
  });
}

export async function getTransitionScreen(id: string) {
  const screen = await prisma.transitionScreen.findUnique({ where: { id }, include: screenInclude });
  if (!screen) throw new AppError(404, 'Transition screen not found');
  return screen;
}

export async function createTransitionScreen(dto: CreateTransitionScreenDto) {
  return prisma.transitionScreen.create({
    data: {
      name: dto.name,
      description: dto.description,
    },
    include: screenInclude,
  });
}

export async function updateTransitionScreen(id: string, dto: UpdateTransitionScreenDto) {
  const screen = await prisma.transitionScreen.findUnique({ where: { id } });
  if (!screen) throw new AppError(404, 'Transition screen not found');

  return prisma.transitionScreen.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
    },
    include: screenInclude,
  });
}

export async function deleteTransitionScreen(id: string) {
  const screen = await prisma.transitionScreen.findUnique({
    where: { id },
    include: { _count: { select: { transitions: true } } },
  });
  if (!screen) throw new AppError(404, 'Transition screen not found');
  if (screen._count.transitions > 0) throw new AppError(400, 'SCREEN_IN_USE');

  await prisma.transitionScreen.delete({ where: { id } });
  return { ok: true };
}

export async function replaceItems(id: string, dto: ScreenItemsDto) {
  const screen = await prisma.transitionScreen.findUnique({ where: { id } });
  if (!screen) throw new AppError(404, 'Transition screen not found');

  // Validate all customFieldIds exist
  const cfIds = [...new Set(dto.items.map((i) => i.customFieldId))];
  const fields = await prisma.customField.findMany({ where: { id: { in: cfIds } }, select: { id: true } });
  if (fields.length !== cfIds.length) throw new AppError(404, 'One or more custom fields not found');

  await prisma.$transaction(async (tx) => {
    await tx.transitionScreenItem.deleteMany({ where: { screenId: id } });
    await tx.transitionScreenItem.createMany({
      data: dto.items.map((item, idx) => ({
        screenId: id,
        customFieldId: item.customFieldId,
        isRequired: item.isRequired ?? false,
        orderIndex: item.orderIndex ?? idx,
      })),
    });
  });

  return getTransitionScreen(id);
}
