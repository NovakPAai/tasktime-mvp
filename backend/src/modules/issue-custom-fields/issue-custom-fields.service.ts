import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { UpsertCustomFieldValuesDto } from './issue-custom-fields.dto.js';

// ===== Scope priority (higher index = more specific = wins) =====

const SCOPE_PRIORITY: Record<string, number> = {
  GLOBAL: 0,
  ISSUE_TYPE: 1,
  PROJECT: 2,
  PROJECT_ISSUE_TYPE: 3,
};

// ===== Core: resolve applicable fields for an issue =====

export async function getApplicableFields(issueId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { id: true, projectId: true, issueTypeConfigId: true },
  });
  if (!issue) throw new AppError(404, 'Issue not found');

  const { projectId, issueTypeConfigId } = issue;

  // Find all ACTIVE schemas whose bindings match this issue
  const activeSchemas = await prisma.fieldSchema.findMany({
    where: {
      status: 'ACTIVE',
      bindings: {
        some: {
          OR: [
            { scopeType: 'GLOBAL' },
            { scopeType: 'PROJECT', projectId },
            ...(issueTypeConfigId
              ? [
                  { scopeType: 'ISSUE_TYPE' as const, issueTypeConfigId },
                  { scopeType: 'PROJECT_ISSUE_TYPE' as const, projectId, issueTypeConfigId },
                ]
              : []),
          ],
        },
      },
    },
    include: {
      items: {
        include: { customField: true },
        orderBy: { orderIndex: 'asc' },
      },
      bindings: true,
    },
  });

  // For each field, find the highest-priority schema item that applies to this issue.
  // Key: customFieldId → { item, scopePriority }
  const fieldMap = new Map<
    string,
    { item: (typeof activeSchemas)[0]['items'][0]; scopePriority: number; schemaId: string }
  >();

  for (const schema of activeSchemas) {
    // Determine the highest scope priority this schema has for the issue
    let schemaScopePriority = -1;
    for (const binding of schema.bindings) {
      const matches =
        binding.scopeType === 'GLOBAL' ||
        (binding.scopeType === 'PROJECT' && binding.projectId === projectId) ||
        (binding.scopeType === 'ISSUE_TYPE' && binding.issueTypeConfigId === issueTypeConfigId) ||
        (binding.scopeType === 'PROJECT_ISSUE_TYPE' &&
          binding.projectId === projectId &&
          binding.issueTypeConfigId === issueTypeConfigId);

      if (matches) {
        const p = SCOPE_PRIORITY[binding.scopeType] ?? 0;
        if (p > schemaScopePriority) schemaScopePriority = p;
      }
    }

    if (schemaScopePriority < 0) continue;

    for (const item of schema.items) {
      const existing = fieldMap.get(item.customFieldId);
      if (!existing || schemaScopePriority > existing.scopePriority) {
        fieldMap.set(item.customFieldId, {
          item,
          scopePriority: schemaScopePriority,
          schemaId: schema.id,
        });
      }
    }
  }

  return Array.from(fieldMap.values())
    .sort((a, b) => a.item.orderIndex - b.item.orderIndex)
    .map(({ item, schemaId }) => ({
      customFieldId: item.customFieldId,
      name: item.customField.name,
      description: item.customField.description,
      fieldType: item.customField.fieldType,
      options: item.customField.options,
      isRequired: item.isRequired,
      showOnKanban: item.showOnKanban,
      orderIndex: item.orderIndex,
      schemaId,
    }));
}

// ===== GET /api/issues/:id/custom-fields =====

export async function getIssueCustomFields(issueId: string) {
  const fields = await getApplicableFields(issueId);

  if (fields.length === 0) return { fields: [], values: [] };

  const fieldIds = fields.map((f) => f.customFieldId);
  const values = await prisma.issueCustomFieldValue.findMany({
    where: { issueId, customFieldId: { in: fieldIds } },
    select: { customFieldId: true, value: true, updatedAt: true, updatedById: true },
  });

  const valueMap = new Map(values.map((v) => [v.customFieldId, v]));

  return {
    fields: fields.map((f) => ({
      ...f,
      currentValue: valueMap.get(f.customFieldId)?.value ?? null,
      updatedAt: valueMap.get(f.customFieldId)?.updatedAt ?? null,
    })),
  };
}

// ===== PUT /api/issues/:id/custom-fields (batch upsert) =====

export async function upsertIssueCustomFields(
  issueId: string,
  dto: UpsertCustomFieldValuesDto,
  actorId: string,
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true } });
  if (!issue) throw new AppError(404, 'Issue not found');

  // Validate that all submitted fields are applicable to this issue
  const applicable = await getApplicableFields(issueId);
  const applicableIds = new Set(applicable.map((f) => f.customFieldId));

  const invalid = dto.values.filter((v) => !applicableIds.has(v.customFieldId));
  if (invalid.length > 0) {
    throw new AppError(
      422,
      `Fields not applicable to this issue: ${invalid.map((v) => v.customFieldId).join(', ')}`,
    );
  }

  await prisma.$transaction(
    dto.values.map((v) =>
      prisma.issueCustomFieldValue.upsert({
        where: { issueId_customFieldId: { issueId, customFieldId: v.customFieldId } },
        create: {
          issueId,
          customFieldId: v.customFieldId,
          value: v.value as Prisma.InputJsonValue,
          updatedById: actorId,
        },
        update: {
          value: v.value as Prisma.InputJsonValue,
          updatedById: actorId,
        },
      }),
    ),
  );

  return getIssueCustomFields(issueId);
}

// ===== Helper: kanban fields for a list of issues =====
// Used by the issues list endpoint when includeKanbanFields=true

export async function getKanbanFieldsForIssues(
  issues: Array<{ id: string; projectId: string; issueTypeConfigId: string | null }>,
): Promise<Map<string, Array<{ customFieldId: string; fieldType: string; name: string; value: unknown; showOnKanban: boolean }>>> {
  if (issues.length === 0) return new Map();

  // Collect unique (projectId, issueTypeConfigId) combos
  type Combo = { projectId: string; issueTypeConfigId: string | null };
  const combos: Combo[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const key = `${issue.projectId}:${issue.issueTypeConfigId ?? 'null'}`;
    if (!seen.has(key)) {
      seen.add(key);
      combos.push({ projectId: issue.projectId, issueTypeConfigId: issue.issueTypeConfigId });
    }
  }

  // For each combo, find applicable showOnKanban fields
  const comboFieldMap = new Map<string, string[]>(); // comboKey → [customFieldId]

  for (const combo of combos) {
    const fields = await prisma.fieldSchema.findMany({
      where: {
        status: 'ACTIVE',
        bindings: {
          some: {
            OR: [
              { scopeType: 'GLOBAL' },
              { scopeType: 'PROJECT', projectId: combo.projectId },
              ...(combo.issueTypeConfigId
                ? [
                    { scopeType: 'ISSUE_TYPE' as const, issueTypeConfigId: combo.issueTypeConfigId },
                    {
                      scopeType: 'PROJECT_ISSUE_TYPE' as const,
                      projectId: combo.projectId,
                      issueTypeConfigId: combo.issueTypeConfigId,
                    },
                  ]
                : []),
            ],
          },
        },
      },
      include: {
        items: {
          where: { showOnKanban: true },
          include: { customField: { select: { id: true, name: true, fieldType: true } } },
          orderBy: { orderIndex: 'asc' },
        },
        bindings: true,
      },
    });

    // Resolve priority, take top 3 showOnKanban fields
    const fieldPriority = new Map<string, number>();
    const fieldMeta = new Map<string, { name: string; fieldType: string }>();

    for (const schema of fields) {
      let schemaPriority = -1;
      for (const binding of schema.bindings) {
        const matches =
          binding.scopeType === 'GLOBAL' ||
          (binding.scopeType === 'PROJECT' && binding.projectId === combo.projectId) ||
          (binding.scopeType === 'ISSUE_TYPE' &&
            binding.issueTypeConfigId === combo.issueTypeConfigId) ||
          (binding.scopeType === 'PROJECT_ISSUE_TYPE' &&
            binding.projectId === combo.projectId &&
            binding.issueTypeConfigId === combo.issueTypeConfigId);
        if (matches) {
          const p = SCOPE_PRIORITY[binding.scopeType] ?? 0;
          if (p > schemaPriority) schemaPriority = p;
        }
      }
      if (schemaPriority < 0) continue;

      for (const item of schema.items) {
        const existing = fieldPriority.get(item.customFieldId);
        if (existing === undefined || schemaPriority > existing) {
          fieldPriority.set(item.customFieldId, schemaPriority);
          fieldMeta.set(item.customFieldId, {
            name: item.customField.name,
            fieldType: item.customField.fieldType,
          });
        }
      }
    }

    const topFields = Array.from(fieldPriority.keys()).slice(0, 3);
    const key = `${combo.projectId}:${combo.issueTypeConfigId ?? 'null'}`;
    comboFieldMap.set(key, topFields);

    // Store meta for later
    for (const [fId, meta] of fieldMeta) {
      comboFieldMap.set(`meta:${fId}`, [meta.name, meta.fieldType] as unknown as string[]);
    }
  }

  // Collect all needed field IDs and issue IDs
  const allFieldIds = new Set<string>();
  for (const issue of issues) {
    const key = `${issue.projectId}:${issue.issueTypeConfigId ?? 'null'}`;
    const fields = comboFieldMap.get(key) ?? [];
    fields.forEach((f) => allFieldIds.add(f));
  }

  if (allFieldIds.size === 0) return new Map();

  // Fetch all values in one query
  const values = await prisma.issueCustomFieldValue.findMany({
    where: {
      issueId: { in: issues.map((i) => i.id) },
      customFieldId: { in: Array.from(allFieldIds) },
    },
    select: { issueId: true, customFieldId: true, value: true },
  });

  const valueMap = new Map<string, unknown>();
  for (const v of values) {
    valueMap.set(`${v.issueId}:${v.customFieldId}`, v.value);
  }

  // Build result map: issueId → fields with values
  const result = new Map<string, Array<{ customFieldId: string; fieldType: string; name: string; value: unknown; showOnKanban: boolean }>>();

  for (const issue of issues) {
    const comboKey = `${issue.projectId}:${issue.issueTypeConfigId ?? 'null'}`;
    const fieldIds = comboFieldMap.get(comboKey) ?? [];
    const fieldData = fieldIds.map((fId) => {
      const meta = comboFieldMap.get(`meta:${fId}`) as unknown as [string, string] | undefined;
      return {
        customFieldId: fId,
        name: meta?.[0] ?? '',
        fieldType: meta?.[1] ?? '',
        value: valueMap.get(`${issue.id}:${fId}`) ?? null,
        showOnKanban: true,
      };
    });
    result.set(issue.id, fieldData);
  }

  return result;
}
