# Backend Unit Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real backend unit-test layer for all extractable pure logic, while documenting a follow-up coverage roadmap for every remaining non-unit area.

**Architecture:** Keep unit-tests limited to pure helpers and domain rules. When a service mixes domain logic with `Prisma` or `Redis`, first extract the pure rule/calculation/mapper into a helper module, then cover that helper with tests. Everything infrastructure-bound stays in explicit integration/API layers.

**Tech Stack:** TypeScript 5, Vitest, existing `backend/tests` setup, real `jsonwebtoken`, real `bcryptjs`, Express types, Prisma-backed integration tests for non-unit layers.

---

### Task 1: Create unit-test directory conventions

**Files:**
- Modify: `backend/vitest.config.ts`
- Create: `backend/tests/unit/shared/.gitkeep`
- Create: `backend/tests/unit/modules/.gitkeep`

**Step 1: Write the failing test**

No behavior test yet. This task establishes the directory and runner structure for the new unit layer.

**Step 2: Run test to verify current baseline**

Run: `npm run test -- --runInBand`

Expected: current backend tests run as they do today, with no dedicated unit-test structure yet.

**Step 3: Write minimal implementation**

- Ensure the current Vitest config continues to support unit tests under `backend/tests/unit/**/*.test.ts`.
- Create placeholder directories so the new layer has a stable home.

**Step 4: Run verification**

Run: `npm run test -- --runInBand`

Expected: existing tests still run; no regression from the structural change.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 2: Add real unit tests for shared utilities

**Files:**
- Create: `backend/tests/unit/shared/utils/jwt.test.ts`
- Create: `backend/tests/unit/shared/utils/password.test.ts`
- Create: `backend/tests/unit/shared/utils/params.test.ts`
- Test: `backend/src/shared/utils/jwt.ts`
- Test: `backend/src/shared/utils/password.ts`
- Test: `backend/src/shared/utils/params.ts`

**Step 1: Write the failing tests**

Add focused tests that verify:

- `signAccessToken` creates a token that `verifyAccessToken` can decode back to the original payload;
- `signRefreshToken` creates a token that `verifyRefreshToken` can decode back to the original payload;
- verifying a refresh token with the access verifier fails, and vice versa;
- malformed or foreign tokens throw;
- `hashPassword` does not return the original string and `comparePassword` only accepts the correct password;
- `param()` returns the raw string value and collapses array values to the first item.

**Step 2: Run tests to verify they fail or reveal missing coverage**

Run:
- `npm run test -- backend/tests/unit/shared/utils/jwt.test.ts`
- `npm run test -- backend/tests/unit/shared/utils/password.test.ts`
- `npm run test -- backend/tests/unit/shared/utils/params.test.ts`

Expected: at least part of the suite is red because the tests do not exist yet.

**Step 3: Write minimal implementation**

Prefer no production change in this task unless tests reveal a real bug in the utility implementation.

**Step 4: Run tests to verify they pass**

Run the same three commands again.

Expected: PASS with no DB setup dependency.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 3: Extract sprint domain helpers

**Files:**
- Create: `backend/src/modules/sprints/sprints.domain.ts`
- Modify: `backend/src/modules/sprints/sprints.service.ts`

**Step 1: Write the failing test**

Create the red tests first in:

- `backend/tests/unit/modules/sprints/sprints.domain.test.ts`

Cover:

- stats calculation for no issues, partial estimates, and full estimates;
- start-transition guard for missing sprint, wrong state, and existing active sprint;
- close-transition guard for missing sprint and wrong state;
- `listAllSprints` filter builder for `state`, `projectId`, and `teamId`;
- unresolved issue selector for "return to backlog" behavior.

**Step 2: Run test to verify it fails**

Run: `npm run test -- backend/tests/unit/modules/sprints/sprints.domain.test.ts`

Expected: FAIL because `sprints.domain.ts` does not exist yet.

**Step 3: Write minimal implementation**

Create pure helpers in `sprints.domain.ts`, for example:

- `calculateSprintStats()`
- `assertCanStartSprint()`
- `assertCanCloseSprint()`
- `buildListAllSprintsWhere()`
- `getIncompleteSprintIssueIds()` or equivalent

Update `sprints.service.ts` to use those helpers without changing API behavior.

**Step 4: Run tests to verify they pass**

Run:
- `npm run test -- backend/tests/unit/modules/sprints/sprints.domain.test.ts`
- `npm run test -- backend/tests/sprints-time-comments.test.ts`

Expected:
- new unit tests PASS;
- existing sprint-related integration tests remain green.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 4: Extract auth domain helpers

**Files:**
- Create: `backend/src/modules/auth/auth.domain.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/tests/unit/modules/auth/auth.domain.test.ts`

**Step 1: Write the failing test**

Add red tests for:

- `buildTokenPayload()` from a user shape;
- `hashRefreshToken()` producing deterministic SHA-256 output;
- `generateRefreshExpiry()` creating a future timestamp in the expected time window;
- `buildRefreshTokenRecord()` shaping data for persistence;
- `buildSessionSnapshot()` shaping Redis session payload;
- guard helpers that reject inactive or missing users for login/refresh flows.

**Step 2: Run test to verify it fails**

Run: `npm run test -- backend/tests/unit/modules/auth/auth.domain.test.ts`

Expected: FAIL because the new helper module does not exist yet.

**Step 3: Write minimal implementation**

Create `auth.domain.ts` with pure helpers and replace duplicated inline logic in `auth.service.ts` with those helpers.

Do not move Prisma or Redis calls into the unit layer.

**Step 4: Run tests to verify they pass**

Run:
- `npm run test -- backend/tests/unit/modules/auth/auth.domain.test.ts`
- `npm run test -- backend/tests/auth.test.ts`

Expected:
- auth domain unit tests PASS;
- existing auth API tests remain green.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 5: Extract issue and time pure logic

**Files:**
- Create: `backend/src/modules/issues/issues.domain.ts`
- Modify: `backend/src/modules/issues/issues.service.ts`
- Create: `backend/tests/unit/modules/issues/issues.domain.test.ts`
- Create: `backend/src/modules/time/time.domain.ts`
- Modify: `backend/src/modules/time/time.service.ts`
- Create: `backend/tests/unit/modules/time/time.domain.test.ts`

**Step 1: Write the failing tests**

For `issues.domain.test.ts`, cover:

- allowed parent-child combinations;
- rejection of invalid hierarchy combinations;
- filter building for `status`, `type`, `priority`, `assigneeId`, `sprintId`, `search`, `from`, `to`;
- translation of `UNASSIGNED` and `BACKLOG`.

For `time.domain.test.ts`, cover:

- elapsed hours calculation from start/stop timestamps;
- rounding to two decimals;
- shaping of manual time-log payload defaults.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/unit/modules/issues/issues.domain.test.ts`
- `npm run test -- backend/tests/unit/modules/time/time.domain.test.ts`

Expected: FAIL because the helper modules do not exist yet.

**Step 3: Write minimal implementation**

Extract the smallest possible pure helpers into `issues.domain.ts` and `time.domain.ts`, then wire services to use them.

**Step 4: Run tests to verify they pass**

Run:
- `npm run test -- backend/tests/unit/modules/issues/issues.domain.test.ts`
- `npm run test -- backend/tests/unit/modules/time/time.domain.test.ts`
- `npm run test -- backend/tests/issues.test.ts`
- `npm run test -- backend/tests/sprints-time-comments.test.ts`

Expected: new unit tests PASS and related integration coverage stays green.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 6: Extract AI, admin, and project pure helpers

**Files:**
- Create: `backend/src/modules/ai/ai-sessions.domain.ts`
- Modify: `backend/src/modules/ai/ai-sessions.service.ts`
- Create: `backend/tests/unit/modules/ai/ai-sessions.domain.test.ts`
- Create: `backend/src/modules/admin/admin.domain.ts`
- Modify: `backend/src/modules/admin/admin.service.ts`
- Create: `backend/tests/unit/modules/admin/admin.domain.test.ts`
- Create: `backend/src/modules/projects/projects.domain.ts`
- Modify: `backend/src/modules/projects/projects.service.ts`
- Create: `backend/tests/unit/modules/projects/projects.domain.test.ts`

**Step 1: Write the failing tests**

Cover:

- AI split normalization, hour allocation, and cost allocation;
- admin assignee-name mapping and cache-key builders;
- project dashboard active sprint summary calculation.

**Step 2: Run tests to verify they fail**

Run:
- `npm run test -- backend/tests/unit/modules/ai/ai-sessions.domain.test.ts`
- `npm run test -- backend/tests/unit/modules/admin/admin.domain.test.ts`
- `npm run test -- backend/tests/unit/modules/projects/projects.domain.test.ts`

Expected: FAIL because the helper modules do not exist yet.

**Step 3: Write minimal implementation**

Extract only real pure logic. Do not extract pass-through Prisma calls.

**Step 4: Run tests to verify they pass**

Run:
- `npm run test -- backend/tests/unit/modules/ai/ai-sessions.domain.test.ts`
- `npm run test -- backend/tests/unit/modules/admin/admin.domain.test.ts`
- `npm run test -- backend/tests/unit/modules/projects/projects.domain.test.ts`
- `npm run test -- backend/tests/admin.test.ts`
- `npm run test -- backend/tests/projects.test.ts`

Expected: unit tests PASS and existing module-level integration tests remain green.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 7: Audit remaining services and stop at the unit boundary

**Files:**
- Modify: `docs/plans/2026-03-13-backend-unit-testing-design.md`
- Modify: `docs/plans/2026-03-13-backend-unit-testing-plan.md`

**Step 1: Write the failing test**

No code test. This is a coverage audit task.

**Step 2: Run audit**

Review the remaining backend services:

- `backend/src/modules/comments/comments.service.ts`
- `backend/src/modules/teams/teams.service.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/boards/boards.service.ts`

Expected: determine whether any additional pure helpers remain worth extracting.

**Step 3: Write minimal implementation**

Update the two planning docs with:

- what else was successfully extracted into the unit layer;
- what remains infrastructure-bound and should stay out of unit tests.

**Step 4: Verify documentation accuracy**

Run a final spot-check against the touched services and confirm the docs match the code reality.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 8: Prepare the remaining non-unit coverage backlog

**Files:**
- Create: `docs/plans/2026-03-13-backend-integration-and-api-coverage-plan.md`

**Step 1: Write the failing test**

No executable test in this task. The output is the backlog document for the remaining layers.

**Step 2: Gather remaining coverage scope**

List all non-unit areas still uncovered:

- Prisma-backed service integration;
- Redis-backed integration;
- middleware and HTTP contract coverage;
- smoke/e2e backend flows.

**Step 3: Write minimal implementation**

Create a follow-up plan document with grouped tasks for:

- service + DB integration;
- service + Redis integration;
- HTTP/API contract tests;
- smoke verification.

**Step 4: Verify completeness**

Compare the follow-up plan with the unit-test design and confirm every non-unit area has an explicit owner layer.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 9: Final verification

**Files:**
- Modify: touched backend files only if verification reveals defects

**Step 1: Write the failing test**

No new tests. Reuse the full set of new unit tests and existing integration tests.

**Step 2: Run verification commands**

Run:
- `npm run test -- backend/tests/unit/shared/utils/jwt.test.ts`
- `npm run test -- backend/tests/unit/shared/utils/password.test.ts`
- `npm run test -- backend/tests/unit/shared/utils/params.test.ts`
- `npm run test -- backend/tests/unit/modules/**/*.test.ts`
- `npm run test -- backend/tests/auth.test.ts`
- `npm run test -- backend/tests/issues.test.ts`
- `npm run test -- backend/tests/projects.test.ts`
- `npm run test -- backend/tests/sprints-time-comments.test.ts`
- `npm run test -- backend/tests/admin.test.ts`
- `npm run typecheck`

Expected:
- all new unit tests PASS;
- touched integration tests PASS;
- backend typecheck PASS.

**Step 3: Write minimal implementation**

Only fix issues surfaced by verification.

**Step 4: Run verification again**

Repeat the same commands until the output is clean.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.
