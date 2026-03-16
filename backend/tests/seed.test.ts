import { describe, expect, it } from 'vitest';

import { resolveSeedActors } from '../src/prisma/seed.js';

describe('resolveSeedActors', () => {
  it('falls back to generic admin when owner admin email is not configured', () => {
    const actors = resolveSeedActors([
      { id: 'admin-id', email: 'admin@tasktime.ru', name: 'Admin User', role: 'ADMIN' },
      { id: 'manager-id', email: 'manager@tasktime.ru', name: 'Project Manager', role: 'MANAGER' },
      { id: 'dev-id', email: 'dev@tasktime.ru', name: 'Developer', role: 'USER' },
      { id: 'viewer-id', email: 'viewer@tasktime.ru', name: 'CIO Viewer', role: 'VIEWER' },
    ]);

    expect(actors.admin.email).toBe('admin@tasktime.ru');
    expect(actors.owner.email).toBe('admin@tasktime.ru');
    expect(actors.viewer.email).toBe('viewer@tasktime.ru');
  });

  it('uses configured owner admin when it exists among seeded users', () => {
    const actors = resolveSeedActors(
      [
        { id: 'admin-id', email: 'admin@tasktime.ru', name: 'Admin User', role: 'ADMIN' },
        { id: 'manager-id', email: 'manager@tasktime.ru', name: 'Project Manager', role: 'MANAGER' },
        { id: 'dev-id', email: 'dev@tasktime.ru', name: 'Developer', role: 'USER' },
        { id: 'viewer-id', email: 'viewer@tasktime.ru', name: 'CIO Viewer', role: 'VIEWER' },
        { id: 'owner-id', email: 'novak.pavel@tasktime.ru', name: 'Owner Admin', role: 'ADMIN' },
      ],
      'novak.pavel@tasktime.ru',
    );

    expect(actors.owner.email).toBe('novak.pavel@tasktime.ru');
    expect(actors.admin.email).toBe('admin@tasktime.ru');
  });
});
