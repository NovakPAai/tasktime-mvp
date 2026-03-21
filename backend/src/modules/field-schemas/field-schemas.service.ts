import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type {
  CreateFieldSchemaDto,
  UpdateFieldSchemaDto,
  CopyFieldSchemaDto,
  AddFieldSchemaItemDto,
  ReorderFieldSchemaItemsDto,
  ReplaceFieldSchemaItemsDto,
  CreateFieldSchemaBindingDto,
} from './field-schemas.dto.js';

const schemaInclude = {
  items: {
    include: { customField: true },
    orderBy: { orderIndex: 'asc' as const },
  },
  bindings: {
    include: {
      project: { select: { id: true, name: true, key: true } },
      issueTypeConfig: { select: { id: true, name: true } },
    },
  },
};

// ===== SCHEMAS =====

export async function listFieldSchemas() {
  return prisma.fieldSchema.findMany({
    include: schemaInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getFieldSchema(id: string) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id }, include: schemaInclude });
  if (!schema) throw new AppError(404, 'Field schema not found');
  return schema;
}

export async function createFieldSchema(dto: CreateFieldSchemaDto) {
  return prisma.fieldSchema.create({
    data: { name: dto.name, description: dto.description },
    include: schemaInclude,
  });
}

export async function updateFieldSchema(id: string, dto: UpdateFieldSchemaDto) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id } });
  if (!schema) throw new AppError(404, 'Field schema not found');

  return prisma.fieldSchema.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      // Editing metadata of an ACTIVE schema moves it back to DRAFT
      ...(schema.status === 'ACTIVE' && { status: 'DRAFT' }),
    },
    include: schemaInclude,
  });
}

export async function deleteFieldSchema(id: string) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id } });
  if (!schema) throw new AppError(404, 'Field schema not found');
  if (schema.isDefault && schema.status === 'ACTIVE') {
    throw new AppError(409, 'Cannot delete the default active schema');
  }

  await prisma.fieldSchema.delete({ where: { id } });
  return { ok: true };
}

export async function copyFieldSchema(id: string, dto: CopyFieldSchemaDto) {
  const original = await prisma.fieldSchema.findUnique({
    where: { id },
    include: { items: true, bindings: true },
  });
  if (!original) throw new AppError(404, 'Field schema not found');

  return prisma.$transaction(async (tx) => {
    const copy = await tx.fieldSchema.create({
      data: {
        name: dto.name,
        description: dto.description ?? original.description,
        status: 'DRAFT',
        copiedFromId: id,
      },
    });

    if (original.items.length > 0) {
      await tx.fieldSchemaItem.createMany({
        data: original.items.map((item) => ({
          schemaId: copy.id,
          customFieldId: item.customFieldId,
          orderIndex: item.orderIndex,
          isRequired: item.isRequired,
          showOnKanban: item.showOnKanban,
        })),
      });
    }

    if (dto.copyBindings && original.bindings.length > 0) {
      await tx.fieldSchemaBinding.createMany({
        data: original.bindings.map((b) => ({
          schemaId: copy.id,
          scopeType: b.scopeType,
          projectId: b.projectId,
          issueTypeConfigId: b.issueTypeConfigId,
        })),
      });
    }

    return tx.fieldSchema.findUnique({ where: { id: copy.id }, include: schemaInclude });
  });
}

export async function publishFieldSchema(id: string) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id }, include: schemaInclude });
  if (!schema) throw new AppError(404, 'Field schema not found');
  if (schema.status === 'ACTIVE') throw new AppError(409, 'Schema is already active');

  if (schema.items.length === 0) {
    throw new AppError(422, 'Cannot publish a schema with no fields');
  }

  // Activate the schema
  return prisma.fieldSchema.update({
    where: { id },
    data: { status: 'ACTIVE' },
    include: schemaInclude,
  });
}

export async function unpublishFieldSchema(id: string) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id } });
  if (!schema) throw new AppError(404, 'Field schema not found');
  if (schema.status === 'DRAFT') throw new AppError(409, 'Schema is already in draft');

  return prisma.fieldSchema.update({
    where: { id },
    data: { status: 'DRAFT' },
    include: schemaInclude,
  });
}

export async function setDefaultFieldSchema(id: string) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id } });
  if (!schema) throw new AppError(404, 'Field schema not found');
  if (schema.status !== 'ACTIVE') throw new AppError(422, 'Only an active schema can be set as default');

  return prisma.$transaction(async (tx) => {
    // Unset previous default
    await tx.fieldSchema.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    return tx.fieldSchema.update({
      where: { id },
      data: { isDefault: true },
      include: schemaInclude,
    });
  });
}

// ===== ITEMS =====

export async function addFieldSchemaItem(schemaId: string, dto: AddFieldSchemaItemDto) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id: schemaId } });
  if (!schema) throw new AppError(404, 'Field schema not found');

  const field = await prisma.customField.findUnique({ where: { id: dto.customFieldId } });
  if (!field) throw new AppError(404, 'Custom field not found');
  if (!field.isEnabled) throw new AppError(422, 'Cannot add a disabled custom field to schema');

  const existing = await prisma.fieldSchemaItem.findUnique({
    where: { schemaId_customFieldId: { schemaId, customFieldId: dto.customFieldId } },
  });
  if (existing) throw new AppError(409, 'Field already exists in this schema');

  const maxOrder = await prisma.fieldSchemaItem.aggregate({
    where: { schemaId },
    _max: { orderIndex: true },
  });
  const orderIndex = dto.orderIndex ?? (maxOrder._max.orderIndex ?? -1) + 1;

  return prisma.fieldSchemaItem.create({
    data: {
      schemaId,
      customFieldId: dto.customFieldId,
      orderIndex,
      isRequired: dto.isRequired,
      showOnKanban: dto.showOnKanban,
    },
    include: { customField: true },
  });
}

export async function removeFieldSchemaItem(schemaId: string, itemId: string) {
  const item = await prisma.fieldSchemaItem.findFirst({ where: { id: itemId, schemaId } });
  if (!item) throw new AppError(404, 'Schema item not found');

  await prisma.fieldSchemaItem.delete({ where: { id: itemId } });
  return { ok: true };
}

export async function reorderFieldSchemaItems(schemaId: string, dto: ReorderFieldSchemaItemsDto) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id: schemaId } });
  if (!schema) throw new AppError(404, 'Field schema not found');

  await prisma.$transaction(
    dto.updates.map((u) =>
      prisma.fieldSchemaItem.update({
        where: { id: u.id },
        data: { orderIndex: u.orderIndex },
      }),
    ),
  );
  return { ok: true };
}

export async function replaceFieldSchemaItems(schemaId: string, dto: ReplaceFieldSchemaItemsDto) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id: schemaId } });
  if (!schema) throw new AppError(404, 'Field schema not found');

  return prisma.$transaction(async (tx) => {
    await tx.fieldSchemaItem.deleteMany({ where: { schemaId } });
    if (dto.items.length > 0) {
      await tx.fieldSchemaItem.createMany({
        data: dto.items.map((item) => ({
          schemaId,
          customFieldId: item.customFieldId,
          orderIndex: item.orderIndex,
          isRequired: item.isRequired,
          showOnKanban: item.showOnKanban,
        })),
      });
    }
    return tx.fieldSchema.findUnique({ where: { id: schemaId }, include: schemaInclude });
  });
}

// ===== BINDINGS =====

export async function listFieldSchemaBindings(schemaId: string) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id: schemaId } });
  if (!schema) throw new AppError(404, 'Field schema not found');

  return prisma.fieldSchemaBinding.findMany({
    where: { schemaId },
    include: {
      project: { select: { id: true, name: true, key: true } },
      issueTypeConfig: { select: { id: true, name: true } },
    },
  });
}

export async function addFieldSchemaBinding(schemaId: string, dto: CreateFieldSchemaBindingDto) {
  const schema = await prisma.fieldSchema.findUnique({ where: { id: schemaId } });
  if (!schema) throw new AppError(404, 'Field schema not found');

  if (dto.projectId) {
    const project = await prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new AppError(404, 'Project not found');
  }
  if (dto.issueTypeConfigId) {
    const config = await prisma.issueTypeConfig.findUnique({ where: { id: dto.issueTypeConfigId } });
    if (!config) throw new AppError(404, 'Issue type config not found');
  }

  try {
    return await prisma.fieldSchemaBinding.create({
      data: {
        schemaId,
        scopeType: dto.scopeType,
        projectId: dto.projectId ?? null,
        issueTypeConfigId: dto.issueTypeConfigId ?? null,
      },
      include: {
        project: { select: { id: true, name: true, key: true } },
        issueTypeConfig: { select: { id: true, name: true } },
      },
    });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new AppError(409, 'This binding already exists for the schema');
    }
    throw err;
  }
}

export async function removeFieldSchemaBinding(schemaId: string, bindingId: string) {
  const binding = await prisma.fieldSchemaBinding.findFirst({ where: { id: bindingId, schemaId } });
  if (!binding) throw new AppError(404, 'Binding not found');

  await prisma.fieldSchemaBinding.delete({ where: { id: bindingId } });
  return { ok: true };
}

// ===== PUBLIC: schemas applicable to a project =====

export async function listProjectFieldSchemas(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  return prisma.fieldSchema.findMany({
    where: {
      status: 'ACTIVE',
      bindings: {
        some: {
          OR: [
            { scopeType: 'GLOBAL' },
            { scopeType: 'PROJECT', projectId },
            { scopeType: 'ISSUE_TYPE' },
            { scopeType: 'PROJECT_ISSUE_TYPE', projectId },
          ],
        },
      },
    },
    include: schemaInclude,
  });
}
