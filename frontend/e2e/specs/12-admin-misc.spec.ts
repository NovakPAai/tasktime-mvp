import { test, expect } from '../fixtures/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

/**
 * Smoke tests for all admin sub-routes.
 * Each test just navigates and confirms the page renders without crashing.
 */
const ADMIN_ROUTES = [
  { path: '/admin/dashboard', name: 'Admin dashboard' },
  { path: '/admin/users', name: 'Admin users' },
  { path: '/admin/projects', name: 'Admin projects' },
  { path: '/admin/workflows', name: 'Admin workflows' },
  { path: '/admin/workflow-schemes', name: 'Admin workflow schemes' },
  { path: '/admin/issue-type-configs', name: 'Admin issue type configs' },
  { path: '/admin/issue-type-schemes', name: 'Admin issue type schemes' },
  { path: '/admin/link-types', name: 'Admin link types' },
  { path: '/admin/roles', name: 'Admin roles' },
  { path: '/admin/monitoring', name: 'Admin monitoring' },
  { path: '/admin/categories', name: 'Admin categories' },
];

test.describe('Admin — Misc smoke', () => {
  for (const route of ADMIN_ROUTES) {
    test(`${route.name} renders without crash`, async ({ page }) => {
      await page.goto(`${BASE}${route.path}`);
      // Wait for React to mount and render something meaningful
      await page.waitForFunction(() => {
        const root = document.getElementById('root');
        return root !== null && (root.textContent?.trim().length ?? 0) > 0;
      }, { timeout: 15_000 });
      // Must not end up on login page
      await expect(page).not.toHaveURL(/\/login$/);
    });
  }
});
