import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { comparePassword } from '../src/shared/utils/password.js';
import { BOOTSTRAP_USERS, bootstrapDefaultUsers } from '../src/prisma/bootstrap.js';

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

describe('bootstrapDefaultUsers', () => {
  it('creates the default users idempotently', async () => {
    await bootstrapDefaultUsers(prisma, 'password123');
    await bootstrapDefaultUsers(prisma, 'password123');

    const users = await prisma.user.findMany({
      orderBy: { email: 'asc' },
      select: {
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });

    expect(users).toHaveLength(BOOTSTRAP_USERS.length);
    expect(users.map((user) => user.email)).toEqual(
      [...BOOTSTRAP_USERS].map((user) => user.email).sort(),
    );
    expect(users.every((user) => user.isActive)).toBe(true);
    expect(await comparePassword('password123', users[0]!.passwordHash)).toBe(true);
  });
});
