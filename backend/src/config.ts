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

  // TTMP-160: release checkpoints scheduler + burndown (burndown fields are placeholders for
  // PR-10; they live here now so shared/config typing stays stable across PR-4 → PR-10).
  CHECKPOINTS_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  CHECKPOINTS_SCHEDULER_CRON: z.string().default('*/10 * * * *'),
  CHECKPOINTS_EVAL_WINDOW_DAYS: z.coerce.number().min(1).max(365).default(30),
  // Consumed in PR-8 (CHECKPOINT_WEBHOOK post-function). Declared now so the config schema
  // stays stable across PRs and ops can set the value ahead of the feature landing.
  CHECKPOINT_WEBHOOK_TIMEOUT_MS: z.coerce.number().min(500).max(60000).default(5000),
  BURNDOWN_SNAPSHOT_CRON: z.string().default('5 0 * * *'),
  BURNDOWN_RETENTION_CRON: z.string().default('0 3 * * 0'),
  BURNDOWN_RETENTION_DAYS_AFTER_DONE: z.coerce.number().min(7).max(3650).default(90),
  BURNDOWN_WEEKLY_AGG_AFTER_DAYS: z.coerce.number().min(30).max(3650).default(365),
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
