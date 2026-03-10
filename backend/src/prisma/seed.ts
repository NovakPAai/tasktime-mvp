import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create users
  const passwordHash = await bcrypt.hash('password123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@tasktime.ru' },
    update: {},
    create: { email: 'admin@tasktime.ru', passwordHash, name: 'Admin User', role: 'ADMIN' },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@tasktime.ru' },
    update: {},
    create: { email: 'manager@tasktime.ru', passwordHash, name: 'Project Manager', role: 'MANAGER' },
  });

  const dev = await prisma.user.upsert({
    where: { email: 'dev@tasktime.ru' },
    update: {},
    create: { email: 'dev@tasktime.ru', passwordHash, name: 'Developer', role: 'USER' },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@tasktime.ru' },
    update: {},
    create: { email: 'viewer@tasktime.ru', passwordHash, name: 'CIO Viewer', role: 'VIEWER' },
  });

  // Create projects
  const project = await prisma.project.upsert({
    where: { key: 'DEMO' },
    update: {},
    create: { name: 'Demo Project', key: 'DEMO', description: 'Demo project for testing' },
  });

  const backendProject = await prisma.project.upsert({
    where: { key: 'BACK' },
    update: {},
    create: { name: 'Backend Services', key: 'BACK', description: 'Backend microservices' },
  });

  // Create issues with hierarchy
  const epic = await prisma.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 1 } },
    update: {},
    create: {
      projectId: project.id, number: 1, title: 'User Authentication System',
      type: 'EPIC', priority: 'HIGH', creatorId: manager.id, assigneeId: dev.id,
    },
  });

  const story = await prisma.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 2 } },
    update: {},
    create: {
      projectId: project.id, number: 2, title: 'Login & Registration Flow',
      type: 'STORY', priority: 'HIGH', creatorId: manager.id, assigneeId: dev.id,
      parentId: epic.id, status: 'IN_PROGRESS',
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 3 } },
    update: {},
    create: {
      projectId: project.id, number: 3, title: 'Implement JWT token generation',
      type: 'TASK', priority: 'HIGH', creatorId: manager.id, assigneeId: dev.id,
      parentId: story.id, status: 'DONE',
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 4 } },
    update: {},
    create: {
      projectId: project.id, number: 4, title: 'Create login form UI',
      type: 'TASK', priority: 'MEDIUM', creatorId: manager.id, assigneeId: dev.id,
      parentId: story.id, status: 'IN_PROGRESS',
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 5 } },
    update: {},
    create: {
      projectId: project.id, number: 5, title: 'Fix password validation bug',
      type: 'BUG', priority: 'CRITICAL', creatorId: dev.id,
      parentId: epic.id,
    },
  });

  console.log('Seed complete.');
  console.log(`Users: ${admin.email}, ${manager.email}, ${dev.email}, ${viewer.email}`);
  console.log(`Password for all: password123`);
  console.log(`Projects: ${project.key}, ${backendProject.key}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
