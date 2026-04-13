import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const isCI = process.env.CI === 'true';
const isMainBranch = process.env.GITHUB_REF === 'refs/heads/main';

// When E2E_BASE_URL points to a remote host, don't spin up a local webServer
const isRemote = baseURL.startsWith('http://5.') ||
  baseURL.startsWith('http://72.') ||
  (process.env.E2E_REMOTE === 'true');

export default defineConfig({
  testDir: './e2e/specs',
  // Remote staging can be slow (VPS under load) — use 3-minute test timeout
  timeout: isRemote ? 180_000 : 90_000,
  expect: {
    timeout: isRemote ? 30_000 : 15_000,
  },
  retries: isCI ? 2 : (isRemote ? 1 : 0),
  // Use 1 worker for remote staging to prevent concurrent beforeAll conflicts and server overload.
  workers: isRemote ? 1 : (isCI ? 2 : 4),
  use: {
    baseURL,
    storageState: 'e2e/.auth/admin.json',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
    ['json', { outputFile: 'e2e-report/results.json' }],
    ...(isCI && isMainBranch
      ? [['./e2e/reporters/github-issue-reporter.ts'] as [string]]
      : []),
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
