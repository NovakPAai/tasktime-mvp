import { config as loadEnv } from 'dotenv';

import { buildSafeTestDatabaseUrl } from './test-database.js';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.test', override: true });

process.env.NODE_ENV = 'test';

// TTSRH-1 PR-7: saved-filter + search tests exercise the feature-flagged mount.
// Default OFF in prod, but tests always expect the routes to be live unless a
// specific test explicitly overrides it.
process.env.FEATURES_ADVANCED_SEARCH ??= 'true';

if (process.env.DATABASE_URL) {
  const sourceUrl = new URL(process.env.DATABASE_URL);
  const databaseName = sourceUrl.pathname.split('/').filter(Boolean).at(-1) ?? 'tasktime';

  process.env.TASKTIME_TEST_DATABASE_NAME ??= `${databaseName}_${Date.now()}_test`;
  process.env.TASKTIME_TEST_SCHEMA ??= `test_${process.pid}`;
  process.env.DATABASE_URL = buildSafeTestDatabaseUrl(process.env.DATABASE_URL);
}
