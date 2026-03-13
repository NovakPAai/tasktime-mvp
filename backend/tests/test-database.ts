const DEFAULT_TEST_SCHEMA = 'test';

function getTestSchema(): string {
  return process.env.TASKTIME_TEST_SCHEMA || DEFAULT_TEST_SCHEMA;
}

function getDatabaseName(url: URL): string {
  return url.pathname.split('/').filter(Boolean).at(-1) ?? '';
}

export function buildSafeTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const databaseName = getDatabaseName(url);
  const currentSchema = url.searchParams.get('schema');
  const testDatabaseName = process.env.TASKTIME_TEST_DATABASE_NAME;

  if (testDatabaseName) {
    url.pathname = `/${testDatabaseName}`;
    url.searchParams.set('schema', 'public');
    return url.toString();
  }

  if ((!currentSchema || currentSchema === 'public') && !databaseName.endsWith('_test')) {
    url.searchParams.set('schema', getTestSchema());
  }

  return url.toString();
}

export function assertSafeTestDatabaseUrl(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema');
  const databaseName = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  const looksIsolated = Boolean(schema?.startsWith(DEFAULT_TEST_SCHEMA)) || databaseName.endsWith('_test');

  if (!looksIsolated) {
    throw new Error(`Refusing to run tests against a non-isolated database URL: ${databaseUrl}`);
  }
}
