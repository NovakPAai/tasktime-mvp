# Bootstrap Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make bootstrap of built-in users explicit and safer for shared repositories and deployed environments.

**Architecture:** Bootstrap remains available, but moves behind explicit environment flags. Generic built-in users stay in code, while personal admin creation becomes environment-driven. Deploy scripts and env examples make the opt-in behavior visible.

**Tech Stack:** TypeScript, Vitest, Bash, dotenv-style env files

---

### Task 1: Lock bootstrap behind explicit flags

**Files:**
- Modify: `backend/src/prisma/bootstrap.ts`
- Test: `backend/tests/bootstrap.test.ts`

**Step 1: Write the failing test**

- Add tests for:
  - optional owner admin via `BOOTSTRAP_OWNER_ADMIN_EMAIL`
  - duplicate prevention
  - explicit `BOOTSTRAP_ENABLED=true` gating

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/bootstrap.test.ts`

Expected: FAIL because new helpers do not exist yet.

**Step 3: Write minimal implementation**

- Add `getBootstrapUsers()`
- Add `isBootstrapEnabled()`
- Remove hardcoded personal admin from built-in users
- Update bootstrap entrypoint to require explicit enable flag

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/bootstrap.test.ts`

Expected: PASS

### Task 2: Make deploy and env files reflect the new contract

**Files:**
- Modify: `deploy/scripts/deploy.sh`
- Modify: `deploy/env/backend.production.env.example`
- Modify: `deploy/env/backend.staging.env.example`
- Modify: `backend/.env.example`

**Step 1: Update deploy behavior**

- Source backend env during deploy.
- Skip bootstrap unless `BOOTSTRAP_ENABLED=true`.

**Step 2: Update examples**

- Add `BOOTSTRAP_ENABLED`
- Add `BOOTSTRAP_OWNER_ADMIN_EMAIL`
- Document that production bootstrap is disabled by default

**Step 3: Verify**

Run:
- `cd backend && npm run typecheck`
- `bash -n deploy/scripts/deploy.sh`

Expected: both commands succeed.
