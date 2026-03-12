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

  const pavel = await prisma.user.upsert({
    where: { email: 'novak.pavel@tasktime.ru' },
    update: {},
    create: {
      email: 'novak.pavel@tasktime.ru',
      passwordHash,
      name: 'Novak Pavel',
      role: 'ADMIN',
    },
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

  const mvpProject = await prisma.project.upsert({
    where: { key: 'TTMP' },
    update: {},
    create: {
      name: 'TaskTime MVP (vibe-code)',
      key: 'TTMP',
      description: 'MVP системы управления проектами и задачами на vibe-code',
    },
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
      projectId: project.id,
      number: 5,
      title: 'Fix password validation bug',
      type: 'BUG',
      priority: 'CRITICAL',
      creatorId: dev.id,
      parentId: epic.id,
    },
  });

  // Backlog (MVP project): EPIC — Исследование и планирование MVP
  const epicResearch = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 1 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 1,
      title: 'Исследование и планирование MVP',
      type: 'EPIC',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyInterview = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 2 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 2,
      title: 'Интервью по 8 блокам и сбор требований Jira Cut',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicResearch.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 3 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 3,
      title: 'Сформировать требования по продукту, пользователям и сценариям',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyInterview.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 4 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 4,
      title: 'Описать интеграции (GitLab, Confluence, Telegram-бот)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyInterview.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 5 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 5,
      title: 'Зафиксировать требования по безопасности (RBAC, audit log, ФЗ-152)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyInterview.id,
    },
  });

  const storyStack = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 6 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 6,
      title: 'Выбор и фиксация технологического стека',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicResearch.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 7 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 7,
      title: 'Выбрать стек backend (Node 20, Express, TS, Prisma, PostgreSQL, Redis)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyStack.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 8 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 8,
      title: 'Выбрать стек frontend (React 18, Vite, Zustand, Ant Design)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyStack.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 9 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 9,
      title: 'Зафиксировать архитектуру модульного монолита и доменную модель',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyStack.id,
    },
  });

  const storyRebuildPlan = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 10 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 10,
      title: 'План пересборки v2',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicResearch.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 11 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 11,
      title: 'Написать документ REBUILD_PLAN_V2 с архитектурой, API, RBAC, спринтами и NFR',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyRebuildPlan.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 12 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 12,
      title: 'Зафиксировать требования к ОС, браузерам и стратегии деплоя',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyRebuildPlan.id,
    },
  });

  // Backlog (MVP project): EPIC — Спринт 1 — Фундамент системы
  const epicSprint1 = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 13 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 13,
      title: 'Спринт 1 — Фундамент системы',
      type: 'EPIC',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyBackendInfra = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 14 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 14,
      title: 'Базовый backend и инфраструктура',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 15 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 15,
      title: 'Инициализировать backend-проект (Express + TypeScript + ESLint/Prettier)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 16 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 16,
      title: 'Настроить Prisma 6 c PostgreSQL 16',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 17 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 17,
      title: 'Описать Prisma-схему (User, Project, Issue, Comment, AuditLog)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 18 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 18,
      title: 'Реализовать middleware для ошибок и логирования',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  const storyAuthModule = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 19 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 19,
      title: 'Модуль аутентификации (Auth)',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 20 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 20,
      title: 'Реализовать API регистрации, логина, refresh, logout и me на JWT + refresh-токенах',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAuthModule.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 21 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 21,
      title: 'Настроить хранение и проверку токенов, bcrypt-хэширование паролей',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAuthModule.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 22 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 22,
      title: 'Интегрировать RBAC-проверку в middleware',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAuthModule.id,
    },
  });

  const storyUsersRbac = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 23 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 23,
      title: 'Пользователи и роли (Users + RBAC)',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 24 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 24,
      title: 'Реализовать CRUD пользователей и смену ролей (Admin, Manager, User, Viewer)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUsersRbac.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 25 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 25,
      title: 'Реализовать RBAC по ролям на уровне middleware',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUsersRbac.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 26 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 26,
      title: 'Привязать аудит действий к пользователю и сущности',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUsersRbac.id,
    },
  });

  const storyProjects = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 27 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 27,
      title: 'Проекты (Projects)',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 28 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 28,
      title: 'Реализовать CRUD проектов с ключами (DEMO, BACK и т.п.)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyProjects.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 29 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 29,
      title: 'Сделать API фильтрации и получения проектов по пользователю',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyProjects.id,
    },
  });

  const storyIssues = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 30 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 30,
      title: 'Задачи и иерархия (Issues)',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 31 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 31,
      title: 'Описать модель задач с типами EPIC/STORY/TASK/SUBTASK/BUG',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssues.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 32 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 32,
      title: 'Реализовать статусы задач (OPEN, IN_PROGRESS, REVIEW, DONE, CANCELLED)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssues.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 33 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 33,
      title: 'Описать связи родитель–потомок и генерацию ключа PROJECT_KEY-NUMBER',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssues.id,
    },
  });

  const storyAudit = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 34 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 34,
      title: 'Аудит и безопасность (AuditLog)',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 35 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 35,
      title: 'Реализовать middleware аудита всех мутаций',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAudit.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 36 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 36,
      title: 'Привязать записи аудита к пользователю, ресурсу и действию',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAudit.id,
    },
  });

  const storyFrontendShell = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 37 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 37,
      title: 'Frontend — базовая оболочка',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 38 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 38,
      title: 'Инициализировать frontend (Vite + React + Ant Design + Zustand)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendShell.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 39 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 39,
      title: 'Настроить роутинг и базовый AppLayout',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendShell.id,
    },
  });

  const storyFrontendAuthNav = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 40 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 40,
      title: 'Frontend — аутентификация и навигация',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 41 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 41,
      title: 'Реализовать LoginPage с интеграцией Auth API',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendAuthNav.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 42 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 42,
      title: 'Настроить хранение auth-состояния и защиту маршрутов',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendAuthNav.id,
    },
  });

  const storyFrontendProjectsIssues = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 43 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 43,
      title: 'Frontend — проекты и задачи',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 44 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 44,
      title: 'Реализовать ProjectsPage (список проектов)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendProjectsIssues.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 45 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 45,
      title: 'Реализовать ProjectDetailPage со списком задач',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendProjectsIssues.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 46 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 46,
      title: 'Реализовать форму создания/редактирования задач',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendProjectsIssues.id,
    },
  });

  const storySeedLocal = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 47 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 47,
      title: 'Seed-данные и локальный запуск',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 48 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 48,
      title: 'Написать seed-скрипт (4 пользователя, 2 проекта, 5 задач)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySeedLocal.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 49 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 49,
      title: 'Настроить Docker Compose (PostgreSQL 16 + Redis 7)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySeedLocal.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 50 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 50,
      title: 'Настроить Makefile с целями setup, dev, backend, frontend',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySeedLocal.id,
    },
  });

  // Backlog (MVP project): EPIC — Спринт 2 — Доски, спринты, время, комментарии
  const epicSprint2 = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 51 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 51,
      title: 'Спринт 2 — Доски, спринты, время, комментарии',
      type: 'EPIC',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyBoard = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 52 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 52,
      title: 'Kanban Board (backend + UI)',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 53 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 53,
      title: 'Реализовать API канбан-доски (колонки по статусам, порядок задач)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBoard.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 54 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 54,
      title: 'Добавить drag-n-drop перемещение задач с сохранением порядка и статуса',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBoard.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 55 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 55,
      title: 'Реализовать UI доски проекта (BoardPage)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBoard.id,
    },
  });

  const storySprints = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 56 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 56,
      title: 'Спринты (Sprints)',
      type: 'STORY',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 57 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 57,
      title: 'Реализовать модель и API спринтов (создание, старт, закрытие)',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 58 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 58,
      title: 'Реализовать перенос задач между бэклогом и активным спринтом',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 59 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 59,
      title: 'Обеспечить один ACTIVE-спринт на проект',
      type: 'TASK',
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 60 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 60,
      title: 'Реализовать UI спринтов (SprintsPage)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  const storyTime = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 61 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 61,
      title: 'Учёт времени (Time tracking)',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 62 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 62,
      title: 'Реализовать API таймера (старт/стоп) и ручного ввода времени',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyTime.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 63 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 63,
      title: 'Логировать время по пользователю и задаче',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyTime.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 64 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 64,
      title: 'Реализовать страницу My Time (TimePage) с агрегированными данными',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyTime.id,
    },
  });

  const storyComments = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 65 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 65,
      title: 'Комментарии к задачам (Comments)',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 66 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 66,
      title: 'Реализовать API CRUD комментариев с проверкой прав',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyComments.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 67 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 67,
      title: 'Добавить блок комментариев на IssueDetailPage',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyComments.id,
    },
  });

  const storyIssueCardHistory = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 68 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 68,
      title: 'Карточка задачи и история изменений',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 69 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 69,
      title: 'Собрать полную карточку задачи (поля, иерархия, связи, время, комментарии)',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssueCardHistory.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 70 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 70,
      title: 'Показать историю изменений задачи из audit_log на UI',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssueCardHistory.id,
    },
  });

  // Backlog (MVP project): EPIC — Admin, UAT и инженерные улучшения
  const epicAdminUat = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 71 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 71,
      title: 'Admin, UAT и инженерные улучшения',
      type: 'EPIC',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyAdminModule = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 72 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 72,
      title: 'Admin-модуль',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicAdminUat.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 73 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 73,
      title: 'Реализовать admin.service и admin.router с доступом только для ADMIN',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAdminModule.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 74 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 74,
      title: 'Реализовать страницу AdminPage с основными административными секциями',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAdminModule.id,
    },
  });

  const storyUatOnboarding = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 75 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 75,
      title: 'UAT-тесты и онбординг',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicAdminUat.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 76 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 76,
      title: 'Добавить данные UAT-тестов на backend и API для их получения',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUatOnboarding.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 77 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 77,
      title: 'Реализовать страницу UatTestsPage и оверлей UatOnboardingOverlay',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUatOnboarding.id,
    },
  });

  const storyE2eUx = await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 78 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 78,
      title: 'E2E и UX-полиш',
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicAdminUat.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 79 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 79,
      title: 'Настроить Playwright (playwright.config.ts, main-flows.spec.ts) для основных флоу',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyE2eUx.id,
    },
  });

  await prisma.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 80 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 80,
      title: 'Расширить styles.css под современный Linear-like UI',
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyE2eUx.id,
    },
  });

  console.log('Seed complete.');
  console.log(`Users: ${admin.email}, ${manager.email}, ${dev.email}, ${viewer.email}, ${pavel.email}`);
  console.log(`Password for all: password123`);
  console.log(`Projects: ${project.key}, ${backendProject.key}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
