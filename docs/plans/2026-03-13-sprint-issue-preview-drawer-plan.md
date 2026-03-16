# Sprint Issue Preview Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a nested read-only issue preview drawer inside sprint details, while keeping full task editing on the existing issue page.

**Architecture:** Extend the existing `SprintIssuesDrawer` with local selection state for a nested `IssuePreviewDrawer`. Build the preview as a lightweight read-only component that fetches issue details through the existing issue API and exposes navigation to the full `issues/:id` page for editing.

**Tech Stack:** React 18, TypeScript, React Router, Ant Design 5, existing `tt-*` dark theme styles, manual UI verification, frontend lint/build checks.

---

### Task 1: Add failing coverage for sprint issue preview interactions

**Files:**
- Modify: `frontend/e2e/main-flows.spec.ts`
- Test: `frontend/e2e/main-flows.spec.ts`

**Step 1: Write the failing test**

Add a focused Playwright scenario that:
- opens the project sprints page;
- opens sprint details;
- clicks a sprint issue title and expects an issue preview drawer to appear;
- clicks the issue key and expects navigation to `issues/:id`;
- returns to the sprints page and verifies the preview still opens from the title.

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- main-flows.spec.ts --grep "Sprint issue preview drawer"`

Expected: FAIL because the nested preview drawer does not exist yet.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reason**

Run the same command and confirm the failure is due to the missing preview UI, not a bad selector.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 2: Build the read-only issue preview drawer

**Files:**
- Create: `frontend/src/components/issues/IssuePreviewDrawer.tsx`
- Modify: `frontend/src/api/issues.ts`
- Modify: `frontend/src/types/index.ts`

**Step 1: Write the failing test**

Use the Playwright test from Task 1 as the active red test.

**Step 2: Run test to verify it fails**

Run the same focused Playwright command and confirm it is still red before implementation.

**Step 3: Write minimal implementation**

- Create `IssuePreviewDrawer` with props for `open`, `issueId`, and `onClose`.
- Load issue details with the existing issue API client.
- Render read-only fields only:
  - key;
  - title;
  - description;
  - type;
  - status;
  - priority;
  - project;
  - assignee;
  - creator;
  - created date;
  - parent issue;
  - child issues.
- Add a `Редактировать` button linking to `issues/:id`.

**Step 4: Run test to verify progress**

Run: `npm run test:e2e -- main-flows.spec.ts --grep "Sprint issue preview drawer"`

Expected: still FAIL, but now due to the sprint drawer not wiring the preview open state yet.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 3: Wire nested preview into sprint details drawer

**Files:**
- Modify: `frontend/src/components/sprints/SprintIssuesDrawer.tsx`
- Modify: `frontend/src/styles.css`

**Step 1: Write the failing test**

Reuse the red Playwright test from Tasks 1-2.

**Step 2: Run test to verify it fails**

Run the same focused Playwright command and confirm the drawer-open path still fails before wiring changes.

**Step 3: Write minimal implementation**

- Add local `selectedIssueId` state to `SprintIssuesDrawer`.
- Open `IssuePreviewDrawer` when the user clicks the issue title or row.
- Keep the issue key as a direct link to `issues/:id`.
- Reset `selectedIssueId` when the sprint drawer closes.
- Add the minimum CSS needed for nested drawer layout and consistent `tt-*` styling.

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- main-flows.spec.ts --grep "Sprint issue preview drawer"`

Expected: PASS.

**Step 5: Commit**

Skip commit in this session unless explicitly requested by the user.

### Task 4: Final verification and cleanup

**Files:**
- Modify: `frontend/e2e/main-flows.spec.ts` if selector stabilization is needed
- Modify: touched frontend files only if verification reveals issues

**Step 1: Write the failing test**

No new test. Reuse the green Playwright scenario and verify there are no regressions in touched files.

**Step 2: Run verification commands**

Run:
- `npm run lint`
- `npm run build`
- `npm run test:e2e -- main-flows.spec.ts --grep "Sprint issue preview drawer"`

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
