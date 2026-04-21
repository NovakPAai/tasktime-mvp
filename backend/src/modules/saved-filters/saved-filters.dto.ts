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

export const preferencesDto = z.object({
  searchDefaults: z
    .object({
      columns: z.array(z.string().min(1).max(100)).max(50).optional(),
      pageSize: z.number().int().min(10).max(100).optional(),
    })
    .optional(),
});

export type ListQueryDto = z.infer<typeof listQueryDto>;
export type CreateDto = z.infer<typeof createDto>;
export type UpdateDto = z.infer<typeof updateDto>;
export type FavoriteDto = z.infer<typeof favoriteDto>;
export type ShareDto = z.infer<typeof shareDto>;
export type PreferencesDto = z.infer<typeof preferencesDto>;
