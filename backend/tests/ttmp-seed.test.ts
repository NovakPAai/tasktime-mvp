import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { bootstrapDefaultUsers } from '../src/prisma/bootstrap.js';
import { seedDatabase } from '../src/prisma/seed.js';

const prisma = new PrismaClient();

async function clearDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.aiSession.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedDatabase', () => {
  it('seeds only TTMP project data in TTMP_ONLY scope and stays idempotent', async () => {
    await bootstrapDefaultUsers(prisma, 'password123');

    await seedDatabase(prisma, { scope: 'TTMP_ONLY' });
    await seedDatabase(prisma, { scope: 'TTMP_ONLY' });

    const projects = await prisma.project.findMany({
      orderBy: { key: 'asc' },
      select: { id: true, key: true, name: true },
    });
    const ttmpProject = projects[0];

    expect(projects).toEqual([
      {
        id: ttmpProject?.id,
        key: 'TTMP',
        name: 'TaskTime MVP (vibe-code)',
      },
    ]);
    expect(await prisma.sprint.count()).toBe(5);
    expect(await prisma.issue.count()).toBe(80);
    expect(await prisma.aiSession.count()).toBe(0);
    expect(await prisma.timeLog.count()).toBe(0);

    const myTimeTask = await prisma.issue.findUnique({
      where: {
        projectId_number: {
          projectId: ttmpProject!.id,
          number: 64,
        },
      },
      select: {
        title: true,
      },
    });

    expect(myTimeTask?.title).toBe('Реализовать страницу My Time (TimePage) с агрегированными данными');
  });
});
