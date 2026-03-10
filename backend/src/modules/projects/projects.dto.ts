import { z } from 'zod';

export const createProjectDto = z.object({
  name: z.string().min(1).max(255),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/, 'Key must be uppercase letters/digits, starting with a letter'),
  description: z.string().max(2000).optional(),
});

export const updateProjectDto = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
});

export type CreateProjectDto = z.infer<typeof createProjectDto>;
export type UpdateProjectDto = z.infer<typeof updateProjectDto>;
