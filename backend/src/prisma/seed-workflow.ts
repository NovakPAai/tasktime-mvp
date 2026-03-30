import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding workflow engine data...');

  // 1. System WorkflowStatuses
  const statusDefs = [
    { systemKey: 'OPEN',        name: 'Open',        category: 'TODO'        as const, color: '#2196F3', iconName: 'circle-outline' },
    { systemKey: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS' as const, color: '#FF9800', iconName: 'progress-clock'  },
    { systemKey: 'REVIEW',      name: 'Review',      category: 'IN_PROGRESS' as const, color: '#9C27B0', iconName: 'eye-outline'     },
    { systemKey: 'DONE',        name: 'Done',        category: 'DONE'        as const, color: '#4CAF50', iconName: 'check-circle'    },
    { systemKey: 'CANCELLED',   name: 'Cancelled',   category: 'DONE'        as const, color: '#9E9E9E', iconName: 'cancel'          },
  ];

  const statuses: Record<string, { id: string }> = {};
  for (const def of statusDefs) {
    const s = await prisma.workflowStatus.upsert({
      where: { systemKey: def.systemKey },
      update: {},
      create: {
        name: def.name,
        category: def.category,
        color: def.color,
        iconName: def.iconName,
        isSystem: true,
        systemKey: def.systemKey,
      },
    });
    statuses[def.systemKey] = s;
    console.log(`  Status: ${def.name} (${s.id})`);
  }

  // 2. Default Workflow
  const workflow = await prisma.workflow.upsert({
    where: { id: 'default-workflow' },
    update: {},
    create: {
      id: 'default-workflow',
      name: 'Default Workflow',
      description: 'System default workflow with all standard statuses',
      isDefault: true,
      isSystem: true,
    },
  });
  console.log(`  Workflow: ${workflow.name} (${workflow.id})`);

  // 3. WorkflowSteps
  const stepDefs = [
    { systemKey: 'OPEN',        isInitial: true,  orderIndex: 0 },
    { systemKey: 'IN_PROGRESS', isInitial: false, orderIndex: 1 },
    { systemKey: 'REVIEW',      isInitial: false, orderIndex: 2 },
    { systemKey: 'DONE',        isInitial: false, orderIndex: 3 },
    { systemKey: 'CANCELLED',   isInitial: false, orderIndex: 4 },
  ];
  for (const def of stepDefs) {
    await prisma.workflowStep.upsert({
      where: { workflowId_statusId: { workflowId: workflow.id, statusId: statuses[def.systemKey].id } },
      update: {},
      create: {
        workflowId: workflow.id,
        statusId: statuses[def.systemKey].id,
        isInitial: def.isInitial,
        orderIndex: def.orderIndex,
      },
    });
  }
  console.log('  Steps created.');

  // 4. Transitions
  const transitionDefs = [
    { name: 'Start',          from: 'OPEN',        to: 'IN_PROGRESS', isGlobal: false, orderIndex: 0 },
    { name: 'Send to Review', from: 'IN_PROGRESS', to: 'REVIEW',      isGlobal: false, orderIndex: 1 },
    { name: 'Approve',        from: 'REVIEW',      to: 'DONE',        isGlobal: false, orderIndex: 2 },
    { name: 'Complete',       from: 'IN_PROGRESS', to: 'DONE',        isGlobal: false, orderIndex: 3 },
    { name: 'Reopen',         from: 'DONE',        to: 'OPEN',        isGlobal: false, orderIndex: 4 },
    { name: 'Reopen',         from: 'CANCELLED',   to: 'OPEN',        isGlobal: false, orderIndex: 5 },
    { name: 'Cancel',         from: null,          to: 'CANCELLED',   isGlobal: true,  orderIndex: 6 },
    { name: 'Send Back',      from: 'REVIEW',      to: 'IN_PROGRESS', isGlobal: false, orderIndex: 7 },
  ];

  // Remove existing transitions for this workflow to avoid duplicates
  await prisma.workflowTransition.deleteMany({ where: { workflowId: workflow.id } });

  for (const def of transitionDefs) {
    await prisma.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        name: def.name,
        fromStatusId: def.from ? statuses[def.from].id : null,
        toStatusId: statuses[def.to].id,
        isGlobal: def.isGlobal,
        orderIndex: def.orderIndex,
      },
    });
  }
  console.log('  Transitions created.');

  // 5. Default WorkflowScheme
  const scheme = await prisma.workflowScheme.upsert({
    where: { id: 'default-scheme' },
    update: {},
    create: {
      id: 'default-scheme',
      name: 'Default Workflow Scheme',
      description: 'System default scheme mapping all issue types to the default workflow',
      isDefault: true,
    },
  });
  console.log(`  Scheme: ${scheme.name} (${scheme.id})`);

  // Default scheme item (issueTypeConfigId = null → default for all types)
  const existingItem = await prisma.workflowSchemeItem.findFirst({
    where: { schemeId: scheme.id, issueTypeConfigId: null },
  });
  if (!existingItem) {
    await prisma.workflowSchemeItem.create({
      data: {
        schemeId: scheme.id,
        workflowId: workflow.id,
        issueTypeConfigId: null,
      },
    });
  }
  console.log('  Default scheme item created.');

  // 6. Attach all existing projects to default scheme
  const projects = await prisma.project.findMany({ select: { id: true } });
  for (const project of projects) {
    await prisma.workflowSchemeProject.upsert({
      where: { projectId: project.id },
      update: {},
      create: {
        schemeId: scheme.id,
        projectId: project.id,
      },
    });
  }
  console.log(`  Attached ${projects.length} project(s) to default scheme.`);

  console.log('Workflow seed completed successfully.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
