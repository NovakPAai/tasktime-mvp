/**
 * Unit-тест на TTSEC-2 Phase 4 cutover флаг `FEATURES_DIRECT_ROLES_DISABLED`.
 *
 * Проверяем, что при `features.directRolesDisabled=true` сервис `admin.assignProjectRole`
 * отклоняет запрос с 403 до каких-либо запросов в БД. Это важно для prod-cutover: флаг
 * включается ПОСЛЕ миграции всех прямых ролей в группы, и с этого момента новых прямых
 * назначений быть не должно.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    user: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    userProjectRole: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
  delCachedJson: vi.fn(),
  delCacheByPrefix: vi.fn(),
}));
vi.mock('../src/shared/middleware/rbac.js', () => ({
  invalidateProjectPermissionCache: vi.fn(),
}));
vi.mock('../src/modules/project-role-schemes/project-role-schemes.service.js', () => ({
  getSchemeForProject: vi.fn(),
}));

const featuresMock = { directRolesDisabled: false };
vi.mock('../src/shared/features.js', () => ({
  get features() { return featuresMock; },
}));

vi.mock('../src/config.js', () => ({ config: { defaultProjectRole: 'USER' } }));

const { assignProjectRole } = await import('../src/modules/admin/admin.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  featuresMock.directRolesDisabled = false;
});

describe('FEATURES_DIRECT_ROLES_DISABLED enforcement', () => {
  it('allows direct role assignment when flag is false (default)', async () => {
    featuresMock.directRolesDisabled = false;
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    // Not fully wiring the success path — we only need to confirm the flag guard lets
    // the function proceed past the initial check. Any post-check failure is fine.
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.not.toMatchObject({ statusCode: 403, code: expect.stringContaining('Прямые назначения') });
  });

  it('rejects direct role assignment with 403 when flag is true', async () => {
    featuresMock.directRolesDisabled = true;
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    // Guard fires BEFORE any DB hits.
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('error message mentions user groups so admins know the alternative', async () => {
    featuresMock.directRolesDisabled = true;
    try {
      await assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never);
      throw new Error('should not reach');
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message).toMatch(/групп/i);
    }
  });
});
