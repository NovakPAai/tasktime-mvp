import { pathToFileURL } from 'node:url';

import { PrismaClient, type UserRole } from '@prisma/client';

import { hashPassword } from '../shared/utils/password.js';

export const BOOTSTRAP_USERS: ReadonlyArray<{
  email: string;
  name: string;
  role: UserRole;
}> = [
  { email: 'admin@tasktime.ru', name: 'Admin User', role: 'ADMIN' },
  { email: 'novak.pavel@tasktime.ru', name: 'Novak Pavel', role: 'ADMIN' },
  { email: 'manager@tasktime.ru', name: 'Project Manager', role: 'MANAGER' },
  { email: 'dev@tasktime.ru', name: 'Developer', role: 'USER' },
  { email: 'viewer@tasktime.ru', name: 'CIO Viewer', role: 'VIEWER' },
];

type BootstrapPrismaClient = Pick<PrismaClient, 'user'>;

export async function bootstrapDefaultUsers(prisma: BootstrapPrismaClient, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);

  for (const user of BOOTSTRAP_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
      },
    });
  }
}

function getBootstrapPassword(): string | null {
  const password = process.env.BOOTSTRAP_DEFAULT_PASSWORD?.trim();
  if (!password) {
    return null;
  }

  return password;
}

async function main() {
  const password = getBootstrapPassword();
  if (!password) {
    console.log('Skipping bootstrap: BOOTSTRAP_DEFAULT_PASSWORD is not set.');
    return;
  }

  const prisma = new PrismaClient();

  try {
    await bootstrapDefaultUsers(prisma, password);
    console.log(`Bootstrapped ${BOOTSTRAP_USERS.length} default users.`);
  } finally {
    await prisma.$disconnect();
  }
}

const isExecutedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
