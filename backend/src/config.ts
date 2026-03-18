import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  REDIS_URL: z.string().optional(),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().min(1).max(3600).default(30),
  GITLAB_WEBHOOK_SECRET: z.string().optional(),
  GITLAB_SYSTEM_USER_ID: z.string().uuid().optional(),
  METRICS_ENABLED: z.enum(['true', 'false']).default('true'),
  METRICS_RETENTION_MINUTES: z.coerce.number().min(5).max(1440).default(60),
});

export const config = envSchema.parse(process.env);
