/**
 * Extended Playwright test fixtures.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/test';
 */
import { test as base, expect } from '@playwright/test';
import * as api from './api.fixture';
import type { AuthSession } from './api.fixture';

export { expect };

export type TestFixtures = {
  /** Pre-authenticated admin session (tokens) */
  adminSession: AuthSession;
  /** Unique prefix for test data isolation, e.g. "E2E_1716000000_" */
  prefix: string;
};

export const test = base.extend<TestFixtures>({
  prefix: async ({}, use) => {
    await use(`E2E_${Date.now()}_`);
  },

  adminSession: async ({ request }, use) => {
    const session = await api.getAdminSession(request);
    await use(session);
  },
});
