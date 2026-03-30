import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default('1h'),
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
  COOKIE_SECRET: z.string().optional(),
});

export const config = envSchema.parse(process.env);

// CVE-01: Enforce strong JWT secrets in production
if (config.NODE_ENV === 'production') {
  const weakPatterns = ['change-me', 'changeme', 'replace', 'secret', 'password'];
  const isWeak = (s: string) => s.length < 32 || weakPatterns.some((p) => s.toLowerCase().includes(p));

  if (isWeak(config.JWT_SECRET)) {
    console.error('FATAL: JWT_SECRET must be >= 32 chars and not contain weak patterns in production. Generate: openssl rand -base64 48');
    process.exit(1);
  }
  if (isWeak(config.JWT_REFRESH_SECRET)) {
    console.error('FATAL: JWT_REFRESH_SECRET must be >= 32 chars and not contain weak patterns in production. Generate: openssl rand -base64 48');
    process.exit(1);
  }
}
