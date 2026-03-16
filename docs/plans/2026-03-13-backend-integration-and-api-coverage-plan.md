# Backend Integration And API Coverage Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cover every backend area that cannot be honestly tested as a unit, using explicit integration, Redis, HTTP/API, and smoke layers.

**Architecture:** Treat this plan as the second half of the backend testing strategy. Unit-tests own pure rules and calculations; this plan owns everything infrastructure-bound: `Prisma`, `Redis`, middleware chains, HTTP contracts, and release smoke scenarios.

**Tech Stack:** TypeScript 5, Vitest, Supertest, Prisma test database, optional Redis test instance, existing backend test setup in `backend/tests`.

---

### Task 1: Stabilize test-layer boundaries

**Files:**
- Modify: `backend/vitest.config.ts`
- Modify: `backend/tests/setup.ts`
- Modify: `backend/tests/env.ts`

**Step 1: Write the failing test**

No new behavior test. This task validates that the test environment can support the remaining layers cleanly.

**Step 2: Run baseline verification**

Run:
- `npm run test -- backend/tests/auth.test.ts`
- `npm run test -- backend/tests/projects.test.ts`

Expected: current API tests pass against the test database setup.

**Step 3: Write minimal implementation**

Make only the configuration changes required to support:

- explicit integration/API suites;
- optional Redis-backed suites;
- predictable environment separation between unit and integration tests.

**Step 4: Run verification again**

Run the same baseline commands and confirm no regression.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 2: Expand Prisma-backed service integration coverage for auth and projects

**Files:**
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/tests/projects.test.ts`

**Step 1: Write the failing tests**

Add missing red scenarios for:

- auth refresh token rotation persistence;
- logout invalidating the persisted token;
- deactivated user behavior across login/refresh;
- project dashboard totals and active sprint summary persistence;
- duplicate project key enforcement;
- cache-visible project dashboard behavior where relevant.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/auth.test.ts`
- `npm run test -- backend/tests/projects.test.ts`

Expected: FAIL for the new scenarios before implementation or fixture updates.

**Step 3: Write minimal implementation**

Only change production code if the failing tests reveal a real bug. Otherwise, improve setup data and assertions only.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 3: Expand Prisma-backed service integration coverage for issues, sprints, time, and comments

**Files:**
- Modify: `backend/tests/issues.test.ts`
- Modify: `backend/tests/sprints-time-comments.test.ts`

**Step 1: Write the failing tests**

Add red scenarios for:

- issue hierarchy validation failures;
- issue filter behavior with status/type/priority/assignee/sprint/search/date combinations;
- sprint close moving incomplete issues back to backlog;
- sprint start refusing a second active sprint;
- timer stop rounding persisted hours correctly;
- manual time logging with explicit and default dates;
- comment ownership and forbidden update/delete flows.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/issues.test.ts`
- `npm run test -- backend/tests/sprints-time-comments.test.ts`

Expected: FAIL for the newly added scenarios.

**Step 3: Write minimal implementation**

Fix only real production bugs exposed by the tests.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 4: Expand integration coverage for teams, admin, and AI session flows

**Files:**
- Modify: `backend/tests/teams.test.ts`
- Modify: `backend/tests/admin.test.ts`
- Modify: `backend/tests/test-database.test.ts`
- Create: `backend/tests/ai-sessions.test.ts`

**Step 1: Write the failing tests**

Add or create red scenarios for:

- team membership assignment and "some users not found" rejection;
- admin stats aggregation with real persisted data;
- report filtering by project, sprint, and date window;
- UAT role filtering behavior;
- AI session creation persisting session metadata and derived `timeLog` rows.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/teams.test.ts`
- `npm run test -- backend/tests/admin.test.ts`
- `npm run test -- backend/tests/ai-sessions.test.ts`

Expected: FAIL until coverage and any missing implementation are added.

**Step 3: Write minimal implementation**

Only adjust production code where a real integration bug is proven.

**Step 4: Run tests to verify they pass**

Run the same commands again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 5: Add Redis integration coverage

**Files:**
- Create: `backend/tests/redis.integration.test.ts`
- Modify: `backend/tests/env.ts`
- Modify: `backend/tests/setup.ts`
- Test: `backend/src/shared/redis.ts`
- Test: `backend/src/shared/health.ts`
- Test: `backend/src/modules/auth/auth.service.ts`
- Test: `backend/src/modules/admin/admin.service.ts`
- Test: `backend/src/modules/projects/projects.service.ts`

**Step 1: Write the failing tests**

Add red Redis-backed scenarios for:

- session save/read/delete lifecycle where supported by the shared Redis helpers;
- readiness status returning `disabled` when `REDIS_URL` is absent;
- readiness status returning `up` or `down` based on actual Redis availability;
- cached admin/project data being served from Redis when present and recomputed when absent;
- auth session side effects being written and cleared correctly.

**Step 2: Run tests to verify they fail**

Run: `npm run test -- backend/tests/redis.integration.test.ts`

Expected: FAIL until Redis-backed setup and assertions exist.

**Step 3: Write minimal implementation**

Make only the changes required to support reliable Redis integration testing. Do not weaken production behavior to make tests easier.

**Step 4: Run tests to verify they pass**

Run the same command again.

Expected: PASS when Redis is available for the suite, or a clearly controlled skip path if Redis integration is intentionally gated by environment.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 6: Add HTTP contract and middleware coverage

**Files:**
- Create: `backend/tests/http-validation.test.ts`
- Create: `backend/tests/http-rbac.test.ts`
- Test: `backend/src/shared/middleware/validate.ts`
- Test: `backend/src/shared/middleware/auth.ts`
- Test: `backend/src/shared/middleware/rbac.ts`
- Test: relevant routers under `backend/src/modules/*/*.router.ts`

**Step 1: Write the failing tests**

Add red HTTP-level scenarios for:

- invalid `body`, `params`, and `query` payloads returning `400` with expected error structure;
- missing token returning `401`;
- insufficient role returning `403`;
- protected routes allowing valid authorized requests through;
- route param parsing and validation edge cases.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/http-validation.test.ts`
- `npm run test -- backend/tests/http-rbac.test.ts`

Expected: FAIL until the new suites and any required assertions are in place.

**Step 3: Write minimal implementation**

Only fix production code where the new contract tests expose real bugs in middleware or routing.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 7: Add health and environment safety coverage

**Files:**
- Modify: `backend/tests/health.test.ts`
- Modify: `backend/tests/test-database.test.ts`
- Test: `backend/src/shared/health.ts`
- Test: `backend/tests/test-database.ts`

**Step 1: Write the failing tests**

Add red scenarios for:

- readiness status when database is reachable and Redis is disabled;
- readiness status when Redis URL exists but Redis is unavailable;
- test database safety guards rejecting unsafe database names or schemas.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/health.test.ts`
- `npm run test -- backend/tests/test-database.test.ts`

Expected: FAIL for the new cases before fixes or setup updates.

**Step 3: Write minimal implementation**

Fix only real health/safety bugs.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 8: Define backend smoke suite

**Files:**
- Create: `backend/tests/smoke-main-flows.test.ts`

**Step 1: Write the failing tests**

Create a minimal red smoke suite covering:

- auth register/login/me;
- project creation or listing;
- issue creation and status update;
- sprint start/close;
- manual time log or timer lifecycle;
- readiness endpoint.

**Step 2: Run tests to verify they fail**

Run: `npm run test -- backend/tests/smoke-main-flows.test.ts`

Expected: FAIL until the suite is implemented and stabilized.

**Step 3: Write minimal implementation**

Keep this suite intentionally small and high signal. Do not duplicate the entire integration suite.

**Step 4: Run tests to verify they pass**

Run the same command again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 9: Final verification

**Files:**
- Modify: touched backend files only if verification reveals defects

**Step 1: Write the failing test**

No new tests. Reuse all touched suites.

**Step 2: Run verification commands**

Run:
- `npm run test -- backend/tests/auth.test.ts`
- `npm run test -- backend/tests/projects.test.ts`
- `npm run test -- backend/tests/issues.test.ts`
- `npm run test -- backend/tests/sprints-time-comments.test.ts`
- `npm run test -- backend/tests/teams.test.ts`
- `npm run test -- backend/tests/admin.test.ts`
- `npm run test -- backend/tests/health.test.ts`
- `npm run test -- backend/tests/test-database.test.ts`
- `npm run test -- backend/tests/http-validation.test.ts`
- `npm run test -- backend/tests/http-rbac.test.ts`
- `npm run test -- backend/tests/redis.integration.test.ts`
- `npm run test -- backend/tests/smoke-main-flows.test.ts`
- `npm run typecheck`

Expected:
- all touched suites PASS;
- backend typecheck PASS.

**Step 3: Write minimal implementation**

Only fix defects revealed by verification.

**Step 4: Run verification again**

Repeat until output is clean.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.
