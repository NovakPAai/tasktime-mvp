/**
 * Unit-тесты для moveIssuesToSprint: cross-project защита.
 * См. TTSEC-2 Phase 2, AI review #65 🟠 — роутер /projects/:projectId/backlog/issues
 * раньше не валидировал, что issueIds принадлежат projectId, что позволяло пользователю
 * с SPRINTS_EDIT в проекте A трогать задачи проекта B.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    issue: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
  delCachedJson: vi.fn(),
  delCacheByPrefix: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));
vi.mock('../src/modules/ai/ai.service.js', () => ({}));

const { moveIssuesToSprint } = await import('../src/modules/sprints/sprints.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.issue.updateMany.mockResolvedValue({ count: 0 });
});

describe('moveIssuesToSprint cross-project guard', () => {
  it('allows move when every issue belongs to expectedProjectId', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', projectId: 'p1' },
      { id: 'i2', projectId: 'p1' },
    ]);
    await expect(
      moveIssuesToSprint(null, ['i1', 'i2'], 'p1'),
    ).resolves.toBeUndefined();
    expect(mockPrisma.issue.updateMany).toHaveBeenCalled();
  });

  it('rejects (403) when any issue belongs to a different project', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', projectId: 'p1' },
      { id: 'i2', projectId: 'p2' }, // foreign
    ]);
    await expect(
      moveIssuesToSprint(null, ['i1', 'i2'], 'p1'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.issue.updateMany).not.toHaveBeenCalled();
  });

  it('rejects (400) when some issue ids are not found', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([{ id: 'i1', projectId: 'p1' }]);
    await expect(
      moveIssuesToSprint(null, ['i1', 'missing'], 'p1'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.issue.updateMany).not.toHaveBeenCalled();
  });

  it('skips cross-project check when expectedProjectId is omitted (legacy callers)', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', projectId: 'p1' },
      { id: 'i2', projectId: 'p2' },
    ]);
    await expect(
      moveIssuesToSprint('sprint-1', ['i1', 'i2']),
    ).resolves.toBeUndefined();
    expect(mockPrisma.issue.updateMany).toHaveBeenCalled();
  });
});
