import { pathToFileURL } from 'node:url';

import { PrismaClient, type UserRole } from '@prisma/client';

import { hashPassword } from '../shared/utils/password.js';

type BootstrapUser = {
  email: string;
  name: string;
  role: UserRole;
};

type BootstrapEnv = Partial<Record<
  'BOOTSTRAP_DEFAULT_PASSWORD' | 'BOOTSTRAP_ENABLED' | 'BOOTSTRAP_OWNER_ADMIN_EMAIL',
  string | undefined
>>;

export const BOOTSTRAP_USERS: ReadonlyArray<{
  email: string;
  name: string;
  role: UserRole;
}> = [
  { email: 'admin@tasktime.ru', name: 'Admin User', role: 'ADMIN' },
  { email: 'manager@tasktime.ru', name: 'Project Manager', role: 'MANAGER' },
  { email: 'dev@tasktime.ru', name: 'Developer', role: 'USER' },
  { email: 'viewer@tasktime.ru', name: 'CIO Viewer', role: 'VIEWER' },
];

type BootstrapPrismaClient = Pick<PrismaClient, 'user'>;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getBootstrapUsers(env: BootstrapEnv = process.env): BootstrapUser[] {
  const users = [...BOOTSTRAP_USERS];
  const ownerAdminEmail = env.BOOTSTRAP_OWNER_ADMIN_EMAIL?.trim();

  if (!ownerAdminEmail) {
    return users;
  }

  const normalizedOwnerAdminEmail = normalizeEmail(ownerAdminEmail);
  if (users.some((user) => normalizeEmail(user.email) === normalizedOwnerAdminEmail)) {
    return users;
  }

  users.push({
    email: ownerAdminEmail,
    name: 'Owner Admin',
    role: 'ADMIN',
  });

  return users;
}

export function isBootstrapEnabled(env: BootstrapEnv = process.env): boolean {
  return env.BOOTSTRAP_ENABLED?.trim().toLowerCase() === 'true';
}

function getBootstrapPassword(env: BootstrapEnv = process.env): string | null {
  const password = env.BOOTSTRAP_DEFAULT_PASSWORD?.trim();
  if (!password) {
    return null;
  }

  return password;
}

export async function bootstrapDefaultUsers(
  prisma: BootstrapPrismaClient,
  password: string,
  users: ReadonlyArray<BootstrapUser> = BOOTSTRAP_USERS,
): Promise<void> {
  const passwordHash = await hashPassword(password);

  for (const user of users) {
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

async function main() {
  if (!isBootstrapEnabled()) {
    console.log('Skipping bootstrap: BOOTSTRAP_ENABLED is not true.');
    return;
  }

  const password = getBootstrapPassword();
  if (!password) {
    console.log('Skipping bootstrap: BOOTSTRAP_DEFAULT_PASSWORD is not set.');
    return;
  }

  const users = getBootstrapUsers();
  const prisma = new PrismaClient();

  try {
    await bootstrapDefaultUsers(prisma, password, users);
    console.log(`Bootstrapped ${users.length} default users.`);
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
