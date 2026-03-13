import { describe, expect, it } from 'vitest';

import { REQUIRED_TABLES, getDatabaseStatusFromTableNames } from '../src/shared/health.js';

describe('health status helpers', () => {
  it('marks database down when required tables are missing', () => {
    const status = getDatabaseStatusFromTableNames(['users']);

    expect(status).toBe('down');
  });

  it('marks database up when required tables exist', () => {
    const status = getDatabaseStatusFromTableNames(REQUIRED_TABLES);

    expect(status).toBe('up');
  });
});
