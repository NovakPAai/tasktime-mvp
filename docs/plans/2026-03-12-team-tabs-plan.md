# Team Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two new top-level sidebar tabs for business-functional teams and flow teams, backed by synthetic frontend-only data and styled consistently with the existing Flow Universe UI.

**Architecture:** Keep this iteration frontend-only. Add two new routes and pages, render synthetic datasets through reusable `tt-panel`/grid patterns, and update the sidebar order so the new sections sit between `Projects` and `Sprints`.

**Tech Stack:** React 18, TypeScript, React Router, Ant Design 5, Playwright, existing `tt-*` dark theme styles.

---

### Task 1: Write failing e2e coverage for the new navigation

**Files:**
- Modify: `frontend/e2e/main-flows.spec.ts`
- Test: `frontend/e2e/main-flows.spec.ts`

**Step 1: Write the failing test**

Add a new Playwright test that:
- logs in;
- asserts sidebar items `Бизнес-функциональные команды` and `Потоковые команды` exist;
- opens `/business-teams` and checks the heading plus a synthetic card label;
- opens `/flow-teams` and checks the heading plus a synthetic flow section label.

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- main-flows.spec.ts --grep "Sidebar: business and flow team tabs"`

Expected: FAIL because the new routes and menu items do not exist yet.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reason**

Run the same command and confirm the failure is due to missing UI, not a broken test selector.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 2: Add routes and sidebar entries

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/BusinessTeamsPage.tsx`
- Create: `frontend/src/pages/FlowTeamsPage.tsx`

**Step 1: Write the failing test**

Use the failing Playwright test from Task 1 as the active red test.

**Step 2: Run test to verify it fails**

Run the same Playwright command and confirm it still fails before code changes.

**Step 3: Write minimal implementation**

- Insert two new menu items after `Projects`.
- Register `/business-teams` and `/flow-teams` routes.
- Create both pages with stable headings and minimal synthetic content so the test can pass.

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- main-flows.spec.ts --grep "Sidebar: business and flow team tabs"`

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 3: Polish the synthetic team pages

**Files:**
- Modify: `frontend/src/pages/BusinessTeamsPage.tsx`
- Modify: `frontend/src/pages/FlowTeamsPage.tsx`
- Modify: `frontend/src/styles.css`

**Step 1: Write the failing test**

Extend the existing Playwright test expectations, if needed, to assert a few stable UI labels:
- a stats section on each page;
- at least one visible team card;
- one visible synthetic backlog/flow issue section.

**Step 2: Run test to verify it fails**

Run the same focused Playwright command.

Expected: FAIL on the newly added assertions.

**Step 3: Write minimal implementation**

- Add realistic synthetic datasets inline or as local constants.
- Render cards, stats, and compact backlog/flow lists.
- Add only the CSS needed for card layout, pills, metrics, and responsive stacking.

**Step 4: Run test to verify it passes**

Run the focused Playwright command again.

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 4: Final verification

**Files:**
- Modify: `frontend/e2e/main-flows.spec.ts` if selectors need stabilization

**Step 1: Write the failing test**

No new test. Reuse the green Playwright scenario and verify no regressions in touched files.

**Step 2: Run verification commands**

Run:
- `npm run lint`
- `npm run build`
- `npm run test:e2e -- main-flows.spec.ts --grep "Sidebar: business and flow team tabs"`

Expected:
- lint passes;
- build passes;
- focused e2e passes.

**Step 3: Write minimal implementation**

Only fix issues discovered by verification.

**Step 4: Run verification again**

Repeat the same commands until output is clean.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.
