import { config as loadEnv } from 'dotenv';

import { buildSafeTestDatabaseUrl } from './test-database.js';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.test', override: true });

process.env.NODE_ENV = 'test';

if (process.env.DATABASE_URL) {
  const sourceUrl = new URL(process.env.DATABASE_URL);
  const databaseName = sourceUrl.pathname.split('/').filter(Boolean).at(-1) ?? 'tasktime';

  process.env.TASKTIME_TEST_DATABASE_NAME ??= `${databaseName}_${Date.now()}_test`;
  process.env.TASKTIME_TEST_SCHEMA ??= `test_${process.pid}`;
  process.env.DATABASE_URL = buildSafeTestDatabaseUrl(process.env.DATABASE_URL);
}
