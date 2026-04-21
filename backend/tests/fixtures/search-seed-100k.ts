/**
 * TTSRH-1 PR-20 — 100K issue seed helper for perf test T-8.
 *
 * Usage (manual, not in CI by default — 100K rows take minutes):
 *   DATABASE_URL=... npx tsx backend/tests/fixtures/search-seed-100k.ts
 *
 * Invariants:
 *   - Idempotent *prefix* — existing rows with issue.title starting with the
 *     TT_PERF_SEED_PREFIX are deleted first, so re-runs don't accumulate.
 *   - Requires at least one Project and one User (creator) in the database;
 *     the script picks the first Project and first non-BOT User it finds.
 *   - Uses chunked createMany (5_000 rows per call) to stay within
 *     Postgres / Prisma query size limits.
 *   - Title distribution is seeded (mulberry32) so T-8 latency profile is
 *     reproducible across runs.
 *
 * T-8 target (§8 NFR-1): p95 `/search/issues` < 400ms over 100K rows with
 * simple predicates (status = X, assignee = currentUser()).
 *
 * Not run in CI — `npm run db:seed:search-100k` is opt-in. The perf check
 * runs on a dedicated benchmarking VM (ops playbook) before flag flip.
 */
import { PrismaClient, IssueStatus, IssuePriority } from '@prisma/client';

export const TT_PERF_SEED_PREFIX = 'TT_PERF_SEED_';
const DEFAULT_TOTAL = 100_000;
const CHUNK = 5_000;

// Seeded PRNG (mulberry32) — deterministic for reproducible p95 profile.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const STATUSES: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.IN_PROGRESS,
  IssueStatus.REVIEW,
  IssueStatus.DONE,
  IssueStatus.BLOCKED,
];

const PRIORITIES: IssuePriority[] = [
  IssuePriority.LOW,
  IssuePriority.MEDIUM,
  IssuePriority.HIGH,
  IssuePriority.CRITICAL,
];

export type SeedOptions = {
  total?: number;
  /** Prisma client to reuse; if omitted, the script creates and closes one. */
  prisma?: PrismaClient;
  /** Overrides auto-picked project id. */
  projectId?: string;
  /** Overrides auto-picked creator id. */
  creatorId?: string;
  /** Mulberry32 seed for reproducibility. */
  seed?: number;
};

export async function seedSearchPerfFixture(opts: SeedOptions = {}): Promise<{
  inserted: number;
  projectId: string;
  creatorId: string;
}> {
  const prisma = opts.prisma ?? new PrismaClient();
  const owns = !opts.prisma;
  try {
    const total = opts.total ?? DEFAULT_TOTAL;
    const rand = mulberry32(opts.seed ?? 0xB0BA);

    const project = opts.projectId
      ? await prisma.project.findUnique({ where: { id: opts.projectId } })
      : await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!project) throw new Error('No Project found — run db:seed:dev first');

    const creator = opts.creatorId
      ? await prisma.user.findUnique({ where: { id: opts.creatorId } })
      : await prisma.user.findFirst({
          where: { email: { not: { contains: 'bot' } } },
          orderBy: { createdAt: 'asc' },
        });
    if (!creator) throw new Error('No User found — run db:seed:dev first');

    // Idempotency: drop existing TT_PERF_SEED_ rows before bulk insert.
    const deleted = await prisma.issue.deleteMany({
      where: { projectId: project.id, title: { startsWith: TT_PERF_SEED_PREFIX } },
    });
    if (deleted.count > 0) {
      console.log(`[seed-100k] cleared ${deleted.count} stale perf-seed rows`);
    }

    // Derive starting issue.number so we don't collide with existing issues.
    const lastIssue = await prisma.issue.findFirst({
      where: { projectId: project.id },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const startNumber = (lastIssue?.number ?? 0) + 1;

    let inserted = 0;
    for (let offset = 0; offset < total; offset += CHUNK) {
      const size = Math.min(CHUNK, total - offset);
      const batch = Array.from({ length: size }, (_, i) => {
        const n = startNumber + offset + i;
        const status = STATUSES[Math.floor(rand() * STATUSES.length)]!;
        const priority = PRIORITIES[Math.floor(rand() * PRIORITIES.length)]!;
        return {
          projectId: project.id,
          number: n,
          title: `${TT_PERF_SEED_PREFIX}${n}`,
          status,
          priority,
          creatorId: creator.id,
          assigneeId: rand() < 0.7 ? creator.id : null,
          orderIndex: n,
        };
      });
      const res = await prisma.issue.createMany({ data: batch, skipDuplicates: true });
      inserted += res.count;
      if ((offset / CHUNK) % 4 === 0) {
        console.log(`[seed-100k] ${inserted}/${total}`);
      }
    }
    console.log(`[seed-100k] done — inserted ${inserted} issues`);
    return { inserted, projectId: project.id, creatorId: creator.id };
  } finally {
    if (owns) await prisma.$disconnect();
  }
}

// Invoked directly via `npx tsx`.
// Uses import.meta.url check — compatible with ESM runtime.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSearchPerfFixture().catch((err) => {
    console.error('[seed-100k] failed:', err);
    process.exit(1);
  });
}
