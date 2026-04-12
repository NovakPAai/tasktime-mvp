import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding release workflow data...');

  // 1. Release Statuses (idempotent upsert by unique name)
  const statusDefs = [
    { id: 'rs-draft',     name: 'Черновик',          category: 'PLANNING'    as const, color: '#8C8C8C', description: 'Начальный статус. Сбор задач в релиз.',                orderIndex: 0 },
    { id: 'rs-building',  name: 'В сборке',          category: 'IN_PROGRESS' as const, color: '#1890FF', description: 'Идёт сборка и интеграция компонентов.',                orderIndex: 1 },
    { id: 'rs-testing',   name: 'На тестировании',   category: 'IN_PROGRESS' as const, color: '#FA8C16', description: 'Релиз передан на QA/тестирование.',                    orderIndex: 2 },
    { id: 'rs-ready',     name: 'Готов к выпуску',    category: 'IN_PROGRESS' as const, color: '#52C41A', description: 'Тестирование пройдено, ожидает развёртывания.',         orderIndex: 3 },
    { id: 'rs-released',  name: 'Выпущен',           category: 'DONE'        as const, color: '#389E0D', description: 'Релиз развёрнут в production.',                         orderIndex: 4 },
    { id: 'rs-cancelled', name: 'Отменён',           category: 'CANCELLED'   as const, color: '#FF4D4F', description: 'Релиз отменён.',                                       orderIndex: 5 },
  ];

  for (const def of statusDefs) {
    const s = await prisma.releaseStatus.upsert({
      where: { name: def.name },
      update: {},
      create: {
        id: def.id,
        name: def.name,
        category: def.category,
        color: def.color,
        description: def.description,
        orderIndex: def.orderIndex,
      },
    });
    console.log(`  ReleaseStatus: ${def.name} (${s.id})`);
  }

  // 2. Default Release Workflow
  const workflow = await prisma.releaseWorkflow.upsert({
    where: { name: 'Стандартный релизный процесс' },
    update: {},
    create: {
      id: 'rw-default',
      name: 'Стандартный релизный процесс',
      description: 'Дефолтный workflow: Черновик → В сборке → На тестировании → Готов к выпуску → Выпущен',
      releaseType: null,
      isDefault: true,
      isActive: true,
    },
  });
  console.log(`  ReleaseWorkflow: ${workflow.name} (${workflow.id})`);

  // 3. Workflow Steps
  const stepDefs = [
    { statusId: 'rs-draft',     isInitial: true,  orderIndex: 0 },
    { statusId: 'rs-building',  isInitial: false, orderIndex: 1 },
    { statusId: 'rs-testing',   isInitial: false, orderIndex: 2 },
    { statusId: 'rs-ready',     isInitial: false, orderIndex: 3 },
    { statusId: 'rs-released',  isInitial: false, orderIndex: 4 },
    { statusId: 'rs-cancelled', isInitial: false, orderIndex: 5 },
  ];

  for (const def of stepDefs) {
    await prisma.releaseWorkflowStep.upsert({
      where: { workflowId_statusId: { workflowId: workflow.id, statusId: def.statusId } },
      update: {},
      create: {
        workflowId: workflow.id,
        statusId: def.statusId,
        isInitial: def.isInitial,
        orderIndex: def.orderIndex,
      },
    });
    console.log(`  Step: ${def.statusId} (initial=${def.isInitial})`);
  }

  // 4. Workflow Transitions
  const transitionDefs = [
    { id: 'rwt-1', name: 'Начать сборку',              fromStatusId: 'rs-draft',    toStatusId: 'rs-building',  isGlobal: false },
    { id: 'rwt-2', name: 'Отправить на тестирование',  fromStatusId: 'rs-building', toStatusId: 'rs-testing',   isGlobal: false },
    { id: 'rwt-3', name: 'Тесты пройдены',              fromStatusId: 'rs-testing',  toStatusId: 'rs-ready',     isGlobal: false },
    { id: 'rwt-4', name: 'Выпустить',                  fromStatusId: 'rs-ready',    toStatusId: 'rs-released',  isGlobal: false },
    { id: 'rwt-5', name: 'Экстренный выпуск',          fromStatusId: 'rs-building', toStatusId: 'rs-released',  isGlobal: false },
    { id: 'rwt-6', name: 'Отменить',                   fromStatusId: 'rs-draft',    toStatusId: 'rs-cancelled', isGlobal: true  },
  ];

  for (const def of transitionDefs) {
    await prisma.releaseWorkflowTransition.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        workflowId: workflow.id,
        name: def.name,
        fromStatusId: def.fromStatusId,
        toStatusId: def.toStatusId,
        isGlobal: def.isGlobal,
      },
    });
    console.log(`  Transition: ${def.name} (${def.fromStatusId} → ${def.toStatusId})`);
  }

  console.log('Release workflow seed completed.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
