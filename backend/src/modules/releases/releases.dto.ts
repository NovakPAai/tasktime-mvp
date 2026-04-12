import { z } from 'zod';

// ─── RM-03.2: Create release (new global endpoint, type-aware) ────────────────

// ─── Date validation helper ───────────────────────────────────────────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s);
    return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Invalid calendar date');

export const createReleaseDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  level: z.enum(['MINOR', 'MAJOR']).default('MINOR'),
  type: z.enum(['ATOMIC', 'INTEGRATION']).default('ATOMIC'),
  projectId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  plannedDate: isoDate.nullable().optional(),
});

// ─── RM-03.3: Update release (immutable: type, projectId; no statusId) ────────

export const updateReleaseDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).nullable().optional(),
  level: z.enum(['MINOR', 'MAJOR']).optional(),
  plannedDate: isoDate.nullable().optional(),
  releaseDate: isoDate.nullable().optional(),
});

// ─── RM-03.1: List query params ───────────────────────────────────────────────

export const listReleasesQueryDto = z.object({
  type: z.enum(['ATOMIC', 'INTEGRATION']).optional(),
  statusId: z.string().optional(), // supports comma-separated UUIDs: "uuid1,uuid2"
  statusCategory: z.enum(['PLANNING', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  projectId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  releaseDateFrom: isoDate.optional(),
  releaseDateTo: isoDate.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'plannedDate', 'releaseDate']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

// ─── RM-03.5: ReleaseItem management ─────────────────────────────────────────

export const releaseItemsAddDto = z.object({
  issueIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.length >= 1, 'issueIds must contain at least one unique id'),
});

export const releaseItemsRemoveDto = z.object({
  issueIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.length >= 1, 'issueIds must contain at least one unique id'),
});

export const listReleaseItemsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

// ─── RM-03.8: Clone release ───────────────────────────────────────────────────

export const cloneReleaseDto = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['ATOMIC', 'INTEGRATION']).optional(),
  projectId: z.string().uuid().nullable().optional(),
  cloneItems: z.boolean().default(false),
  cloneSprints: z.boolean().default(false),
});

// ─── RM-03.6: Execute transition body ────────────────────────────────────────

export const executeTransitionDto = z.object({
  comment: z.string().max(2000).optional(),
});

// ─── Legacy DTOs (kept for backward compat) ──────────────────────────────────

export const moveIssuesToReleaseDto = z.object({
  issueIds: z.array(z.string().uuid()).min(1),
});

export const manageSprintsInReleaseDto = z.object({
  sprintIds: z.array(z.string().uuid()).min(1),
});

export type CreateReleaseDto = z.infer<typeof createReleaseDto>;
export type UpdateReleaseDto = z.infer<typeof updateReleaseDto>;
export type ListReleasesQueryDto = z.infer<typeof listReleasesQueryDto>;
export type ReleaseItemsAddDto = z.infer<typeof releaseItemsAddDto>;
export type ReleaseItemsRemoveDto = z.infer<typeof releaseItemsRemoveDto>;
export type ListReleaseItemsQueryDto = z.infer<typeof listReleaseItemsQueryDto>;
export type CloneReleaseDto = z.infer<typeof cloneReleaseDto>;
export type MoveIssuesToReleaseDto = z.infer<typeof moveIssuesToReleaseDto>;
export type ManageSprintsInReleaseDto = z.infer<typeof manageSprintsInReleaseDto>;
