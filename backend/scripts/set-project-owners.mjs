/**
 * Data migration: set admin as owner for all projects that have no owner set.
 * TTMP-132: Для всех созданных в системе проектов, установить руководителем проекта администратора.
 *
 * Usage:
 *   node scripts/set-project-owners.mjs
 *   TASKTIME_BASE_URL=http://5.129.242.171 TASKTIME_ACCESS_TOKEN=<token> node scripts/set-project-owners.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user found — skipping migration');
    process.exit(1);
  }

  console.log(`Setting owner to admin: ${admin.email} (${admin.id})`);

  const result = await prisma.project.updateMany({
    where: { ownerId: null },
    data: { ownerId: admin.id },
  });

  console.log(`Updated ${result.count} project(s).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
