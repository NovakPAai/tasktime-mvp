import { pathToFileURL } from 'node:url';

import { PrismaClient, type SystemRoleType } from '@prisma/client';

import { hashPassword } from '../shared/utils/password.js';

type BootstrapUser = {
  email: string;
  name: string;
  systemRoles: SystemRoleType[];
  isSystem?: boolean;
};

type BootstrapEnv = Partial<Record<
  'BOOTSTRAP_DEFAULT_PASSWORD' | 'BOOTSTRAP_ENABLED' | 'BOOTSTRAP_OWNER_ADMIN_EMAIL',
  string | undefined
>>;

export const AI_DEVELOPER_EMAIL = 'ai-developer@tasktime.ru';

export const BOOTSTRAP_USERS: ReadonlyArray<BootstrapUser> = [
  { email: 'admin@tasktime.ru', name: 'Admin User', systemRoles: ['ADMIN', 'USER'] },
  { email: 'manager@tasktime.ru', name: 'Project Manager', systemRoles: ['USER'] },
  { email: 'dev@tasktime.ru', name: 'Developer', systemRoles: ['USER'] },
  { email: 'viewer@tasktime.ru', name: 'CIO Viewer', systemRoles: ['AUDITOR', 'USER'] },
  { email: 'georgi.dubovik@tasktime.ru', name: 'Георгий Дубовик', systemRoles: ['SUPER_ADMIN', 'USER'] },
  { email: AI_DEVELOPER_EMAIL, name: 'AI Developer', systemRoles: ['USER'], isSystem: true },
];

type BootstrapPrismaClient = Pick<PrismaClient, 'user' | 'issueLinkType'>;

const SYSTEM_LINK_TYPES: ReadonlyArray<{
  name: string;
  outboundName: string;
  inboundName: string;
}> = [
  { name: 'Блокирует',  outboundName: 'Блокирует',  inboundName: 'Заблокировано' },
  { name: 'Связана с',  outboundName: 'Связана с',  inboundName: 'Связана с' },
  { name: 'Дублирует',  outboundName: 'Дублирует',  inboundName: 'Является дубликатом' },
  { name: 'Зависит от', outboundName: 'Зависит от', inboundName: 'Требуется для' },
];

export async function bootstrapSystemLinkTypes(
  prisma: BootstrapPrismaClient,
): Promise<void> {
  for (const type of SYSTEM_LINK_TYPES) {
    await prisma.issueLinkType.upsert({
      where: { name: type.name },
      update: {},
      create: { ...type, isActive: true, isSystem: true },
    });
  }
}

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
    systemRoles: ['ADMIN', 'USER'],
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
        passwordHash,
        isSystem: user.isSystem ?? false,
        systemRoles: {
          create: user.systemRoles.map((role) => ({ role })),
        },
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
    await bootstrapSystemLinkTypes(prisma);
    console.log('Bootstrapped system link types.');
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
