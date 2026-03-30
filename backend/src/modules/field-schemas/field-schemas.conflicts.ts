import { prisma } from '../../prisma/client.js';
import type { FieldScopeType } from '@prisma/client';

// ===== Types =====

export type ConflictType = 'FIELD_DUPLICATE_SAME_SCOPE' | 'REQUIRED_MISMATCH' | 'KANBAN_OVERFLOW';
export type ConflictSeverity = 'ERROR' | 'WARNING';

export interface FieldConflict {
  conflictType: ConflictType;
  severity: ConflictSeverity;
  description: string;
  customFieldId: string;
  customFieldName: string;
  conflictingSchemaId: string;
  conflictingSchemaName: string;
  scope: {
    scopeType: FieldScopeType;
    projectName?: string;
    issueTypeName?: string;
  };
}

export interface ConflictCheckResult {
  hasErrors: boolean;
  hasWarnings: boolean;
  conflicts: FieldConflict[];
}

// ===== Internal helpers =====

// Two bindings "collide" if they're at the same scopeType with the same identifiers.
// NULL identifiers are treated as "applies to all" — so two GLOBAL bindings always collide,
// two PROJECT bindings with the same projectId collide, etc.
function bindingsCollide(
  a: { scopeType: FieldScopeType; projectId: string | null; issueTypeConfigId: string | null },
  b: { scopeType: FieldScopeType; projectId: string | null; issueTypeConfigId: string | null },
): boolean {
  if (a.scopeType !== b.scopeType) return false;
  if (a.projectId !== b.projectId) return false;
  if (a.issueTypeConfigId !== b.issueTypeConfigId) return false;
  return true;
}

// ===== Main entry point =====

/**
 * Detect conflicts for a DRAFT schema being published.
 * Compares against all currently ACTIVE schemas.
 */
export async function detectConflicts(candidateSchemaId: string): Promise<ConflictCheckResult> {
  const candidate = await prisma.fieldSchema.findUnique({
    where: { id: candidateSchemaId },
    include: {
      items: { include: { customField: true } },
      bindings: {
        include: {
          project: { select: { id: true, name: true } },
          issueTypeConfig: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!candidate) {
    return { hasErrors: false, hasWarnings: false, conflicts: [] };
  }

  const activeSchemas = await prisma.fieldSchema.findMany({
    where: { status: 'ACTIVE', id: { not: candidateSchemaId } },
    include: {
      items: { include: { customField: true } },
      bindings: {
        include: {
          project: { select: { id: true, name: true } },
          issueTypeConfig: { select: { id: true, name: true } },
        },
      },
    },
  });

  const conflicts: FieldConflict[] = [];

  // Build a map: customFieldId → item for fast lookup in active schemas
  for (const activeSchema of activeSchemas) {
    const activeItemsByFieldId = new Map(
      activeSchema.items.map((item) => [item.customFieldId, item]),
    );

    for (const candidateBinding of candidate.bindings) {
      for (const activeBinding of activeSchema.bindings) {
        if (!bindingsCollide(candidateBinding, activeBinding)) continue;

        const scopeInfo = {
          scopeType: candidateBinding.scopeType,
          projectName: candidateBinding.project?.name,
          issueTypeName: candidateBinding.issueTypeConfig?.name,
        };

        // Check each field in the candidate
        for (const candidateItem of candidate.items) {
          const activeItem = activeItemsByFieldId.get(candidateItem.customFieldId);
          if (!activeItem) continue;

          // FIELD_DUPLICATE_SAME_SCOPE — field exists in both schemas at same scope
          conflicts.push({
            conflictType: 'FIELD_DUPLICATE_SAME_SCOPE',
            severity: 'ERROR',
            description:
              `Поле «${candidateItem.customField.name}» уже присутствует в активной схеме «${activeSchema.name}» ` +
              `с тем же уровнем scope (${candidateBinding.scopeType}).`,
            customFieldId: candidateItem.customFieldId,
            customFieldName: candidateItem.customField.name,
            conflictingSchemaId: activeSchema.id,
            conflictingSchemaName: activeSchema.name,
            scope: scopeInfo,
          });

          // REQUIRED_MISMATCH — same scope, but isRequired differs
          if (candidateItem.isRequired !== activeItem.isRequired) {
            conflicts.push({
              conflictType: 'REQUIRED_MISMATCH',
              severity: 'ERROR',
              description:
                `Поле «${candidateItem.customField.name}» является ${candidateItem.isRequired ? 'обязательным' : 'необязательным'} ` +
                `в публикуемой схеме, но ${activeItem.isRequired ? 'обязательным' : 'необязательным'} ` +
                `в активной схеме «${activeSchema.name}» для того же scope (${candidateBinding.scopeType}). ` +
                `Это приводит к неопределённости при блокировке перехода задачи в DONE.`,
              customFieldId: candidateItem.customFieldId,
              customFieldName: candidateItem.customField.name,
              conflictingSchemaId: activeSchema.id,
              conflictingSchemaName: activeSchema.name,
              scope: scopeInfo,
            });
          }
        }
      }
    }
  }

  // KANBAN_OVERFLOW — count showOnKanban fields per binding scope
  // For each binding in the candidate, count how many showOnKanban fields would be visible
  for (const candidateBinding of candidate.bindings) {
    const scopeInfo = {
      scopeType: candidateBinding.scopeType,
      projectName: candidateBinding.project?.name,
      issueTypeName: candidateBinding.issueTypeConfig?.name,
    };

    // Candidate's showOnKanban fields for this binding
    const candidateKanbanFields = candidate.items.filter((i) => i.showOnKanban);

    // Active schemas' showOnKanban fields for the same scope
    const activeKanbanFields: Array<{ customFieldId: string; customFieldName: string; schemaId: string; schemaName: string }> = [];

    for (const activeSchema of activeSchemas) {
      const hasMatchingBinding = activeSchema.bindings.some((b) =>
        bindingsCollide(candidateBinding, b),
      );
      if (!hasMatchingBinding) continue;

      for (const item of activeSchema.items.filter((i) => i.showOnKanban)) {
        activeKanbanFields.push({
          customFieldId: item.customFieldId,
          customFieldName: item.customField.name,
          schemaId: activeSchema.id,
          schemaName: activeSchema.name,
        });
      }
    }

    const totalKanban = candidateKanbanFields.length + activeKanbanFields.length;
    if (totalKanban > 3) {
      // Report once per binding scope for the candidate's showOnKanban fields
      for (const item of candidateKanbanFields) {
        conflicts.push({
          conflictType: 'KANBAN_OVERFLOW',
          severity: 'WARNING',
          description:
            `Для scope ${candidateBinding.scopeType}${scopeInfo.projectName ? ` (${scopeInfo.projectName})` : ''}` +
            `${scopeInfo.issueTypeName ? ` / ${scopeInfo.issueTypeName}` : ''} ` +
            `будет применено ${totalKanban} полей с showOnKanban=true, из которых на Kanban-карточке будут показаны только 3.`,
          customFieldId: item.customFieldId,
          customFieldName: item.customField.name,
          conflictingSchemaId: activeKanbanFields[0]?.schemaId ?? '',
          conflictingSchemaName: activeKanbanFields[0]?.schemaName ?? '',
          scope: scopeInfo,
        });
      }
    }
  }

  // Deduplicate: same field+schema+conflictType combination
  const seen = new Set<string>();
  const deduplicated = conflicts.filter((c) => {
    const key = `${c.conflictType}:${c.customFieldId}:${c.conflictingSchemaId}:${c.scope.scopeType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const hasErrors = deduplicated.some((c) => c.severity === 'ERROR');
  const hasWarnings = deduplicated.some((c) => c.severity === 'WARNING');

  return { hasErrors, hasWarnings, conflicts: deduplicated };
}
