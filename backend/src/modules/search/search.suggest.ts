/**
 * TTSRH-1 PR-6 — orchestrator for the TTS-QL suggest pipeline.
 *
 * Input: raw JQL + cursor offset (or explicit field/operator/prefix overrides
 * from the Basic-builder). Output: `SuggestResponse` with ranked completions
 * + a `context` block describing what the cursor is looking at (used by the
 * editor for conditional formatting).
 *
 * Provider routing follows §5.11 ТЗ:
 *   - field          → static (SYSTEM_FIELDS + custom fields).
 *   - operator       → static (per-field allowed operators).
 *   - value          → provider by expected type, scoped to project access.
 *   - keyword/func   → static.
 */

import { analysePosition } from './search.suggest.position.js';
import {
  suggestBool,
  suggestDateShortcuts,
  suggestEnum,
  suggestEnumByType,
  suggestFields,
  suggestFunctions,
  suggestOperators,
} from './search.suggest.static.js';
import {
  suggestCheckpointTypes,
  suggestGroups,
  suggestIssues,
  suggestIssueTypes,
  suggestLabels,
  suggestProjects,
  suggestReleases,
  suggestSprints,
  suggestStatuses,
  suggestUsers,
} from './search.suggest.providers.js';
import type { Completion, SuggestContext, SuggestResponse } from './search.suggest.types.js';
import { resolveSystemField, type CustomFieldDef } from './search.schema.js';
import type { TtqlType } from './search.types.js';

export async function suggest(
  source: string,
  cursor: number,
  ctx: SuggestContext,
  customFields: readonly CustomFieldDef[],
): Promise<SuggestResponse> {
  // Basic-builder path: caller passes field/operator/prefix directly.
  if (ctx.field || ctx.operator || ctx.prefix !== undefined) {
    const completions = await completionsForField(
      ctx.field ?? '',
      ctx.operator ?? '=',
      ctx.prefix ?? '',
      ctx,
      customFields,
      [],
    );
    return {
      completions,
      context: {
        expectedField: ctx.field,
        expectedType: typeFor(ctx.field ?? '', customFields),
        inValueList: false,
      },
    };
  }

  // Text-editor path: analyse cursor position in the raw JQL.
  const pos = analysePosition(source, cursor);
  switch (pos.expected) {
    case 'field':
      return {
        completions: suggestFields(pos.prefix, customFields),
        context: { inValueList: false },
      };
    case 'operator': {
      const allowed = allowedOpsForField(pos.field ?? '', customFields);
      return {
        completions: suggestOperators(allowed, pos.prefix),
        context: { expectedField: pos.field, inValueList: false },
      };
    }
    case 'value': {
      const completions = await completionsForField(
        pos.field ?? '',
        pos.operator ?? '=',
        pos.prefix,
        ctx,
        customFields,
        pos.pickedValues,
      );
      return {
        completions,
        context: {
          expectedField: pos.field,
          expectedType: typeFor(pos.field ?? '', customFields),
          inValueList: pos.inValueList,
        },
      };
    }
    case 'function-arg':
    case 'keyword':
    default:
      return {
        completions: suggestFunctions(pos.prefix, ctx.variant),
        context: { inValueList: false },
      };
  }
}

// ─── Value routing per field type ──────────────────────────────────────────

async function completionsForField(
  fieldName: string,
  operator: string,
  prefix: string,
  ctx: SuggestContext,
  customFields: readonly CustomFieldDef[],
  picked: readonly string[],
): Promise<Completion[]> {
  const type = typeFor(fieldName, customFields);
  if (!type) {
    // Unknown field — fall back to function suggestions so the user can at
    // least see what's available in the current variant.
    return suggestFunctions(prefix, ctx.variant);
  }

  // Enum fast-path.
  const fieldEnum = suggestEnum(fieldName, prefix, picked);
  if (fieldEnum) return fieldEnum;
  const typeEnum = suggestEnumByType(type, prefix, picked);
  if (typeEnum) return typeEnum;

  switch (type) {
    case 'USER':
      return suggestUsers(prefix, ctx.accessibleProjectIds);
    case 'PROJECT':
      return suggestProjects(prefix, ctx.accessibleProjectIds);
    case 'STATUS':
      return suggestStatuses(prefix, ctx.accessibleProjectIds);
    case 'ISSUE_TYPE':
      return suggestIssueTypes(prefix);
    case 'SPRINT':
      return suggestSprints(prefix, ctx.accessibleProjectIds);
    case 'RELEASE':
      return suggestReleases(prefix, ctx.accessibleProjectIds);
    case 'ISSUE':
      return suggestIssues(prefix, ctx.accessibleProjectIds);
    case 'LABEL':
      return suggestLabels(prefix, ctx.accessibleProjectIds);
    case 'GROUP':
      return suggestGroups(prefix);
    case 'CHECKPOINT_TYPE':
      return suggestCheckpointTypes(prefix);
    case 'BOOL':
      return suggestBool(prefix);
    case 'DATE':
    case 'DATETIME':
      return suggestDateShortcuts(prefix);
    case 'NUMBER':
      // Number values — no dynamic pool. Return empty; editor uses plain input.
      return [];
    case 'TEXT':
    case 'JSON':
      // Text values — no dynamic pool. Editor shows quote-wrap hint.
      return [];
    default:
      return [];
  }
}

function typeFor(fieldName: string, customFields: readonly CustomFieldDef[]): TtqlType | undefined {
  if (!fieldName) return undefined;
  const sys = resolveSystemField(fieldName);
  if (sys) return sys.type;
  const lc = fieldName.toLowerCase();
  const cf = customFields.find((f) => f.name.toLowerCase() === lc || f.id === fieldName);
  return cf?.type;
}

function allowedOpsForField(fieldName: string, customFields: readonly CustomFieldDef[]): readonly string[] {
  if (!fieldName) return [];
  const sys = resolveSystemField(fieldName);
  if (sys) return sys.operators;
  const cf = customFields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase() || f.id === fieldName);
  return cf?.operators ?? [];
}
