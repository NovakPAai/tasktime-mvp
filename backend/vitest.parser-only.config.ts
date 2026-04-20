// Local-only vitest config for running pure-parser tests without Postgres.
// DO NOT commit references to this file into package.json — CI uses the main
// vitest.config.ts which migrates a test database.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
  },
});
