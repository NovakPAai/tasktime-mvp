# Sprint Detail Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Добавить на страницы спринтов drawer с детализацией спринта и таблицей задач, из которой можно открыть каждую задачу.

**Architecture:** Добавляем отдельный backend endpoint для ленивой загрузки задач спринта и один переиспользуемый frontend drawer-компонент. Обе страницы спринтов продолжают грузить только списки спринтов, а детализация подгружается по запросу при открытии drawer.

**Tech Stack:** Node.js 20, Express 4, TypeScript 5, Prisma 6, React 18, Vite, Ant Design 5, React Router.

---

### Task 1: Backend endpoint for sprint issues

**Files:**
- Modify: `backend/src/modules/sprints/sprints.router.ts`
- Modify: `backend/src/modules/sprints/sprints.service.ts`
- Test: `backend/test/sprints/sprints.test.ts` or nearest existing sprint API test file

**Step 1: Write the failing test**

- Add a test for `GET /api/sprints/:id/issues`.
- Assert that the response includes sprint metadata and issues with `project`, `assignee`, `status`, `priority`, and `number`.

**Step 2: Run test to verify it fails**

- Run the sprint API test file only.
- Expected: FAIL because endpoint does not exist yet.

**Step 3: Write minimal implementation**

- Add route `GET /sprints/:id/issues`.
- Add service method that loads the sprint by id with:
  - `project`
  - `projectTeam`
  - `businessTeam`
  - `flowTeam`
  - `issues` including `assignee` and `project`
- Reuse existing sprint stats mapping for consistency.
- Return `{ sprint, issues }`.

**Step 4: Run test to verify it passes**

- Run the same sprint API test file.
- Expected: PASS.

### Task 2: Frontend API and shared drawer

**Files:**
- Modify: `frontend/src/api/sprints.ts`
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/components/sprints/SprintIssuesDrawer.tsx`

**Step 1: Write the failing frontend usage expectation**

- Define the needed response shape in `types/index.ts`.
- Update the consuming pages to reference a new API method and drawer component before implementation is complete.

**Step 2: Run typecheck to verify it fails**

- Run frontend typecheck.
- Expected: FAIL because the new type/API/component are missing.

**Step 3: Write minimal implementation**

- Add `SprintDetailsResponse` type.
- Add `getSprintIssues(sprintId)` API method.
- Create `SprintIssuesDrawer` with:
  - `open`, `sprintId`, `onClose`
  - lazy loading
  - loading, empty, and error states
  - sprint header
  - issues table
  - links to `/issues/:id`

**Step 4: Run typecheck to verify it passes**

- Run frontend typecheck again.
- Expected: PASS for the new shared component and API client.

### Task 3: Integrate drawer into project sprints page

**Files:**
- Modify: `frontend/src/pages/SprintsPage.tsx`

**Step 1: Wire in the drawer**

- Add state for drawer open/close and the sprint id to inspect.
- Add a visible action in the sprint details sidebar to open full task list.

**Step 2: Improve task discoverability**

- Optionally make the sprint row open details on double duty only if it does not conflict with current selection.
- Keep current selection behavior intact.

**Step 3: Verify locally**

- Run frontend typecheck or targeted tests.
- Confirm the page still renders the sprint list, backlog, and the new drawer entry point.

### Task 4: Integrate drawer into global sprints page

**Files:**
- Modify: `frontend/src/pages/GlobalSprintsPage.tsx`

**Step 1: Add shared drawer state**

- Track selected sprint id and drawer visibility.

**Step 2: Add action on sprint cards**

- Add button or clickable affordance `Открыть детали`.
- Open the shared drawer for the selected sprint.

**Step 3: Verify locally**

- Run frontend typecheck or targeted tests.
- Confirm drawer opens from planned, active, and closed cards.

### Task 5: Verification

**Files:**
- Check only modified backend/frontend files

**Step 1: Run backend test**

- Run the sprint API test file containing the new endpoint coverage.

**Step 2: Run frontend typecheck**

- Run the frontend typecheck command.

**Step 3: Check lints**

- Run lints or use IDE diagnostics for the modified files.

**Step 4: Manual smoke test**

- Open `projects/:id/sprints`, select a sprint, open drawer, verify issue links.
- Open `/sprints`, open drawer from any sprint card, verify the same behavior.
