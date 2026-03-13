import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertSafeTestDatabaseUrl, buildSafeTestDatabaseUrl } from './test-database.js';

describe('test database helpers', () => {
  beforeEach(() => {
    delete process.env.TASKTIME_TEST_DATABASE_NAME;
    delete process.env.TASKTIME_TEST_SCHEMA;
  });

  afterEach(() => {
    delete process.env.TASKTIME_TEST_DATABASE_NAME;
    delete process.env.TASKTIME_TEST_SCHEMA;
  });

  it('rewrites the default development schema to an isolated test schema', () => {
    const url = buildSafeTestDatabaseUrl(
      'postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=public',
    );

    expect(url).toBe('postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=test');
  });

  it('rejects urls that still point at the public schema', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=public'),
    ).toThrow('Refusing to run tests against a non-isolated database URL');
  });

  it('accepts urls that point at an isolated schema', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=test'),
    ).not.toThrow();
  });

  it('uses TASKTIME_TEST_SCHEMA when it is defined', () => {
    process.env.TASKTIME_TEST_SCHEMA = 'test_ci_123';

    const url = buildSafeTestDatabaseUrl(
      'postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=public',
    );

    expect(url).toBe('postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=test_ci_123');

  });

  it('uses TASKTIME_TEST_DATABASE_NAME when it is defined', () => {
    process.env.TASKTIME_TEST_DATABASE_NAME = 'tasktime_ci_test';

    const url = buildSafeTestDatabaseUrl(
      'postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=public',
    );

    expect(url).toBe('postgresql://tasktime:tasktime@localhost:5432/tasktime_ci_test?schema=public');
  });

  it('accepts urls that point at derived test schemas', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://tasktime:tasktime@localhost:5432/tasktime?schema=test_ci_123'),
    ).not.toThrow();
  });

  it('accepts urls that point at derived test databases', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://tasktime:tasktime@localhost:5432/tasktime_ci_test?schema=public'),
    ).not.toThrow();
  });
});
