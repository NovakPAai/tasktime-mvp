# Testing Guide

> Last updated: 2026-03-25

---

## Test stack

| Type | Framework | Location |
|------|-----------|---------|
| Unit / Integration (backend) | Vitest + Supertest | `backend/tests/` |
| Unit (frontend) | Vitest | `frontend/src/**/*.test.ts` |
| E2E | Playwright | `frontend/e2e/` |
| Component catalog | Storybook | `frontend/.storybook/` |

---

## Running tests

```bash
# All backend tests
make test
# or:
cd backend && npm test

# Backend tests with coverage
make test-cov
# or:
cd backend && npm run test:coverage

# E2E tests
cd frontend && npm run test:e2e

# E2E with UI (interactive)
cd frontend && npm run test:e2e:ui

# Storybook (component catalog)
cd frontend && npm run storybook
```

---

## Test coverage target

**Minimum: 60%** (project NFR).
Recommended: 80%+ for new code.

Check coverage:
```bash
make test-cov
# → opens coverage report in browser
```

---

## Writing tests

### Backend (Vitest + Supertest)

```typescript
// backend/tests/modules/issues.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

describe('Issues API', () => {
  it('GET /api/projects/:id/issues returns 200', async () => {
    const res = await supertest(app)
      .get('/api/projects/test-project-id/issues')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

### Frontend (Vitest)

```typescript
// frontend/src/components/ui/IssuePriorityTag.test.tsx
import { render } from '@testing-library/react';
import { IssuePriorityTag } from './IssuePriorityTag';

it('renders HIGH priority', () => {
  const { getByText } = render(<IssuePriorityTag priority="HIGH" />);
  expect(getByText('HIGH')).toBeTruthy();
});
```

---

## TDD workflow

Follow this pattern for new features:

```
1. Write test (RED)   → test fails, implementation missing
2. Run test           → verify it fails
3. Implement          → minimal code to pass
4. Run test           → verify it passes
5. Refactor           → clean up without breaking tests
6. Check coverage     → must not decrease
```

---

## CI test matrix

CI runs on every push/PR:
1. `npm run lint` — ESLint + TypeScript check
2. `npm run build` — production build
3. `npm test` — Vitest unit + integration
4. Docker build test

All must pass before merge to `main`.

---

## E2E test structure

```
frontend/e2e/
├── auth.spec.ts      # Login / logout flows
├── issues.spec.ts    # Create, update, delete issues
├── board.spec.ts     # Kanban drag-and-drop
├── sprints.spec.ts   # Sprint lifecycle
└── time.spec.ts      # Time tracking
```

E2E tests run against a live staging environment.
