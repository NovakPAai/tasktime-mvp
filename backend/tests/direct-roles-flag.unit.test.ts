/**
 * Unit-тест на TTSEC-2 Phase 4 cutover флаг `FEATURES_DIRECT_ROLES_DISABLED`.
 *
 * Проверяем, что при `isDirectRolesDisabled()=true` сервис `admin.assignProjectRole`
 * отклоняет запрос с 403 до каких-либо запросов в БД, и что флаг читается ЛЕНИВО —
 * ops могут флипнуть `process.env.FEATURES_DIRECT_ROLES_DISABLED` без restart-а процесса,
 * и следующий запрос уже видит новое значение (AI review #72 🟠).
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

vi.mock('../src/config.js', () => ({ config: { defaultProjectRole: 'USER' } }));

const { assignProjectRole } = await import('../src/modules/admin/admin.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FEATURES_DIRECT_ROLES_DISABLED;
});

describe('FEATURES_DIRECT_ROLES_DISABLED enforcement (lazy-read)', () => {
  it('allows direct role assignment when flag is unset (default)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.not.toMatchObject({ statusCode: 403, code: expect.stringContaining('Прямые назначения') });
  });

  it('rejects direct role assignment with 403 when env flag is true', async () => {
    process.env.FEATURES_DIRECT_ROLES_DISABLED = 'true';
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('error message mentions user groups so admins know the alternative', async () => {
    process.env.FEATURES_DIRECT_ROLES_DISABLED = 'true';
    try {
      await assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never);
      throw new Error('should not reach');
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message).toMatch(/групп/i);
    }
  });

  it('flag is evaluated lazily: flipping process.env mid-session takes effect on the next call', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });

    // 1. unset → guard passes through (downstream errors are expected and fine).
    delete process.env.FEATURES_DIRECT_ROLES_DISABLED;
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.not.toMatchObject({ statusCode: 403, code: expect.stringContaining('Прямые назначения') });

    // 2. Flip env WITHOUT re-importing — guard must activate immediately.
    process.env.FEATURES_DIRECT_ROLES_DISABLED = 'true';
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.toMatchObject({ statusCode: 403 });

    // 3. Flip back — same request type proceeds past the guard again.
    process.env.FEATURES_DIRECT_ROLES_DISABLED = 'false';
    await expect(
      assignProjectRole('actor', 'u1', { projectId: 'p1', role: 'USER' } as never),
    ).rejects.not.toMatchObject({ statusCode: 403, code: expect.stringContaining('Прямые назначения') });
  });
});
