import { z } from 'zod';

export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

export const loginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshDto = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterDto = z.infer<typeof registerDto>;
export type LoginDto = z.infer<typeof loginDto>;
export type RefreshDto = z.infer<typeof refreshDto>;
