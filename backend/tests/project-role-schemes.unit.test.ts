/**
 * Unit-тесты для project-role-schemes сервиса
 * Тестируем сервисный слой с vi.mock — без реальной БД и Redis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/prisma/client.js', () => ({
  prisma: {
    projectRoleScheme: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projectRoleSchemeProject: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    projectRoleDefinition: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    projectRolePermission: {
      upsert: vi.fn(),
    },
    userProjectRole: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    project: { findUnique: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock('../src/shared/redis.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
  delCachedJson: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { prisma } from '../src/prisma/client.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../src/shared/redis.js';
import {
  getSchemeForProject,
  deleteScheme,
  deleteRole,
  updatePermissions,
} from '../src/modules/project-role-schemes/project-role-schemes.service.js';
import { AppError } from '../src/shared/middleware/error-handler.js';

// ─── Typed mock helpers ────────────────────────────────────────────────────────

const mp = prisma as unknown as {
  projectRoleScheme: Record<string, ReturnType<typeof vi.fn>>;
  projectRoleSchemeProject: Record<string, ReturnType<typeof vi.fn>>;
  projectRoleDefinition: Record<string, ReturnType<typeof vi.fn>>;
  projectRolePermission: Record<string, ReturnType<typeof vi.fn>>;
  userProjectRole: Record<string, ReturnType<typeof vi.fn>>;
  project: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const mredis = { getCachedJson: getCachedJson as ReturnType<typeof vi.fn>, setCachedJson: setCachedJson as ReturnType<typeof vi.fn>, delCachedJson: delCachedJson as ReturnType<typeof vi.fn> };

const SCHEME_WITH_ROLES = {
  id: 'scheme-1',
  name: 'Default',
  isDefault: true,
  roles: [{ id: 'role-1', key: 'ADMIN', name: 'Администратор', permissions: [] }],
  projects: [],
  _count: { roles: 1, projects: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mredis.getCachedJson.mockResolvedValue(null);
  mredis.setCachedJson.mockResolvedValue(undefined);
  mredis.delCachedJson.mockResolvedValue(undefined);
});

// ─── getSchemeForProject ───────────────────────────────────────────────────────

describe('getSchemeForProject', () => {
  it('возвращает явно привязанную схему', async () => {
    mp.projectRoleSchemeProject.findUnique.mockResolvedValue({
      projectId: 'proj-1',
      schemeId: 'scheme-1',
      scheme: SCHEME_WITH_ROLES,
    });

    const result = await getSchemeForProject('proj-1');
    expect(result).toEqual(SCHEME_WITH_ROLES);
    expect(mp.projectRoleScheme.findFirst).not.toHaveBeenCalled();
  });

  it('fallback на isDefault=true если нет привязки', async () => {
    mp.projectRoleSchemeProject.findUnique.mockResolvedValue(null);
    mp.projectRoleScheme.findFirst.mockResolvedValue(SCHEME_WITH_ROLES);

    const result = await getSchemeForProject('proj-2');
    expect(result).toEqual(SCHEME_WITH_ROLES);
    expect(mp.projectRoleScheme.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDefault: true } }),
    );
  });

  it('бросает AppError 500 если нет ни привязки, ни дефолта', async () => {
    mp.projectRoleSchemeProject.findUnique.mockResolvedValue(null);
    mp.projectRoleScheme.findFirst.mockResolvedValue(null);

    await expect(getSchemeForProject('proj-3')).rejects.toMatchObject({
      statusCode: 500,
      message: 'No default role scheme configured',
    });
  });

  it('возвращает кэшированный результат без обращения к БД', async () => {
    mredis.getCachedJson.mockResolvedValue(SCHEME_WITH_ROLES);

    const result = await getSchemeForProject('proj-1');
    expect(result).toEqual(SCHEME_WITH_ROLES);
    expect(mp.projectRoleSchemeProject.findUnique).not.toHaveBeenCalled();
  });
});

// ─── deleteScheme ──────────────────────────────────────────────────────────────

describe('deleteScheme', () => {
  it('удаляет схему без привязанных проектов', async () => {
    mp.projectRoleScheme.findUnique.mockResolvedValue({
      id: 'scheme-1',
      isDefault: false,
      _count: { projects: 0 },
    });
    mp.projectRoleScheme.delete.mockResolvedValue({});
    mp.projectRoleSchemeProject.findMany.mockResolvedValue([]);

    const result = await deleteScheme('scheme-1');
    expect(result).toEqual({ ok: true });
    expect(mp.projectRoleScheme.delete).toHaveBeenCalledWith({ where: { id: 'scheme-1' } });
  });

  it('бросает 400 SCHEME_IN_USE если есть привязанные проекты', async () => {
    mp.projectRoleScheme.findUnique.mockResolvedValue({
      id: 'scheme-1',
      isDefault: false,
      _count: { projects: 3 },
    });

    await expect(deleteScheme('scheme-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'SCHEME_IN_USE',
    });
    expect(mp.projectRoleScheme.delete).not.toHaveBeenCalled();
  });

  it('бросает 400 при попытке удалить isDefault схему', async () => {
    mp.projectRoleScheme.findUnique.mockResolvedValue({
      id: 'scheme-1',
      isDefault: true,
      _count: { projects: 0 },
    });

    await expect(deleteScheme('scheme-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot delete the default scheme',
    });
    expect(mp.projectRoleScheme.delete).not.toHaveBeenCalled();
  });

  it('бросает 404 если схема не найдена', async () => {
    mp.projectRoleScheme.findUnique.mockResolvedValue(null);

    await expect(deleteScheme('no-such')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── deleteRole ────────────────────────────────────────────────────────────────

describe('deleteRole', () => {
  it('удаляет кастомную роль без участников', async () => {
    mp.projectRoleDefinition.findFirst.mockResolvedValue({
      id: 'role-1',
      schemeId: 'scheme-1',
      isSystem: false,
    });
    mp.userProjectRole.count.mockResolvedValue(0);
    mp.projectRoleDefinition.delete.mockResolvedValue({});
    mp.projectRoleSchemeProject.findMany.mockResolvedValue([]);

    const result = await deleteRole('scheme-1', 'role-1');
    expect(result).toEqual({ ok: true });
    expect(mp.projectRoleDefinition.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
  });

  it('бросает 400 при попытке удалить isSystem роль', async () => {
    mp.projectRoleDefinition.findFirst.mockResolvedValue({
      id: 'role-1',
      schemeId: 'scheme-1',
      isSystem: true,
    });

    await expect(deleteRole('scheme-1', 'role-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot delete a system role',
    });
    expect(mp.projectRoleDefinition.delete).not.toHaveBeenCalled();
  });

  it('бросает 400 ROLE_IN_USE если у роли есть участники', async () => {
    mp.projectRoleDefinition.findFirst.mockResolvedValue({
      id: 'role-1',
      schemeId: 'scheme-1',
      isSystem: false,
    });
    mp.userProjectRole.count.mockResolvedValue(5);

    await expect(deleteRole('scheme-1', 'role-1')).rejects.toMatchObject({
      statusCode: 400,
    });
    const err = await deleteRole('scheme-1', 'role-1').catch((e: AppError) => e);
    expect((err as AppError).message).toMatch('ROLE_IN_USE');
    expect(mp.projectRoleDefinition.delete).not.toHaveBeenCalled();
  });
});

// ─── updatePermissions ─────────────────────────────────────────────────────────

describe('updatePermissions', () => {
  const ROLE = { id: 'role-1', schemeId: 'scheme-1', permissions: [] };

  beforeEach(() => {
    mp.projectRoleDefinition.findFirst.mockResolvedValue(ROLE);
    mp.projectRoleDefinition.findUnique.mockResolvedValue({ ...ROLE, permissions: [{ permission: 'ISSUES_VIEW', granted: true }] });
    mp.projectRolePermission.upsert.mockResolvedValue({});
    mp.projectRoleSchemeProject.findMany.mockResolvedValue([]);
    mp.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  });

  it('upsert всех переданных разрешений', async () => {
    await updatePermissions('scheme-1', 'role-1', {
      permissions: { ISSUES_VIEW: true, ISSUES_CREATE: false },
    });

    expect(mp.projectRolePermission.upsert).toHaveBeenCalledTimes(2);
    expect(mp.projectRolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ permission: 'ISSUES_VIEW', granted: true }) }),
    );
    expect(mp.projectRolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ permission: 'ISSUES_CREATE', granted: false }) }),
    );
  });

  it('инвалидирует кэш схемы', async () => {
    await updatePermissions('scheme-1', 'role-1', { permissions: { ISSUES_VIEW: true } });

    expect(mredis.delCachedJson).toHaveBeenCalledWith(`rbac:scheme:scheme-1:roles`);
  });
});
