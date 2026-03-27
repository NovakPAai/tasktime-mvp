import { z } from 'zod';

// CVE-11: Password must be 8+ chars with at least 1 uppercase and 1 digit
const passwordSchema = z.string().min(8).max(128)
  .refine((p) => /[A-Z]/.test(p), { message: 'Password must contain at least one uppercase letter' })
  .refine((p) => /\d/.test(p), { message: 'Password must contain at least one digit' });

export const registerDto = z.object({
  email: z.string().email(),
  password: passwordSchema,
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
