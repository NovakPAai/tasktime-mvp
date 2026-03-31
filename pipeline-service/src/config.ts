import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3100),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('pl:'),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().min(1).max(3600).default(30),

  // Auth: API key for service-to-service communication
  PIPELINE_API_KEY: z.string().min(8),

  // GitHub integration
  GITHUB_TOKEN: z.string().default(''),
  APP_GITHUB_REPOS: z.string().default(process.env['GITHUB_REPOS'] ?? ''), // fallback for legacy GITHUB_REPOS env
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  // Polling interval in seconds (min 30s to respect GitHub rate limits)
  SYNC_INTERVAL_SEC: z.coerce.number().min(30).max(3600).default(60),

  // GitHub Actions dispatch — owner/repo derived from APP_GITHUB_REPOS, override if needed
  PIPELINE_GITHUB_REF: z.string().default('main'),

  // Flow Universe API (for issue/release resolution)
  FU_API_URL: z.string().optional(),
  FU_API_KEY: z.string().optional(),
});

export const config = envSchema.parse(process.env);
