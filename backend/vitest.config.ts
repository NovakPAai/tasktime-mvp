import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/env.ts', './tests/setup.ts'],
    testTimeout: 10000,
  },
});
