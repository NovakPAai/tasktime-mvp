/**
 * TTSRH-1 PR-7 — Zod DTO для SavedFilter CRUD, share, favorite, preferences.
 *
 * Публичный API:
 *   • listQueryDto, createDto, updateDto, shareDto, favoriteDto, preferencesDto.
 *
 * Инварианты:
 *   • `jql.max = 10_000` (как на /search/issues, §5.6 ТЗ).
 *   • `name.max = 200` — UI-предел.
 *   • `sharedWith` принимает 2 параллельных массива `users[]`, `groups[]` —
 *     структура соответствует схеме `SavedFilterShare` (XOR userId/groupId).
 *   • `preferences.searchDefaults.columns` — массив строк до 50 элементов,
 *     чтобы не дать пользователю залить произвольный JSON в `User.preferences`.
 *   • При `visibility=SHARED` список `sharedWith` может быть пустым — это
 *     валидный промежуточный state (владелец может поделиться позже через
 *     `POST /:id/share`).
 */

import { z } from 'zod';
import { FilterPermission, FilterVisibility } from '@prisma/client';

const visibilityValues = Object.values(FilterVisibility) as [FilterVisibility, ...FilterVisibility[]];
const permissionValues = Object.values(FilterPermission) as [FilterPermission, ...FilterPermission[]];

const scopeEnum = z.enum(['mine', 'shared', 'public', 'favorite']);

export const listQueryDto = z.object({
  scope: scopeEnum.optional(),
});

const columnsSchema = z
  .array(z.string().min(1).max(100))
  .max(50)
  .optional();

// Note: `permission` is a single value applied to ALL users+groups in one create/share call.
// Per-share granular permissions (e.g. user X = WRITE, group Y = READ) are not supported in
// this PR — callers who need them should issue separate `POST /:id/share` calls (replace-
// semantics) or wait for a future per-share endpoint. This matches the §5.6 HTTP API shape.
const sharedWithSchema = z
  .object({
    users: z.array(z.string().uuid()).max(500).optional(),
    groups: z.array(z.string().uuid()).max(100).optional(),
    permission: z.enum(permissionValues).optional(),
  })
  .optional();

export const createDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).nullable().optional(),
  jql: z.string().min(1).max(10_000),
  visibility: z.enum(visibilityValues).optional(),
  columns: columnsSchema,
  sharedWith: sharedWithSchema,
});

export const updateDto = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2_000).nullable().optional(),
    jql: z.string().min(1).max(10_000).optional(),
    visibility: z.enum(visibilityValues).optional(),
    columns: columnsSchema,
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const favoriteDto = z.object({
  value: z.boolean(),
});

export const shareDto = z.object({
  users: z.array(z.string().uuid()).max(500).optional(),
  groups: z.array(z.string().uuid()).max(100).optional(),
  permission: z.enum(permissionValues).optional(),
});

// Note: `preferencesDto` lives in `users/users.dto.ts` as `updatePreferencesDto` (it's
// attached to the users module because the route is `/api/users/me/preferences`).

export type ListQueryDto = z.infer<typeof listQueryDto>;
export type CreateDto = z.infer<typeof createDto>;
export type UpdateDto = z.infer<typeof updateDto>;
export type FavoriteDto = z.infer<typeof favoriteDto>;
export type ShareDto = z.infer<typeof shareDto>;
