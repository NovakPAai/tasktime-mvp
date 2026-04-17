---
tags: [infra, testing, vitest, playwright]
---

# Infra — Testing

## Backend (Vitest + Supertest)

```bash
make test
# или
cd backend && npx vitest run
```

- Unit тесты: `backend/src/modules/**/*.test.ts`
- Integration тесты: `backend/tests/` (Supertest против реального Express)
- `vitest.config.ts` — конфигурация

## Frontend E2E (Playwright)

```bash
cd frontend && npx playwright test
```

- Тесты: `frontend/tests/`
- Целевые сценарии: login, create issue, board drag-n-drop, timer

## Storybook

```bash
cd frontend && npx storybook dev
```

- Компонентные истории для UI-изолированного тестирования

## Цель покрытия

80%+ unit + integration (backend)
Критические user flows — E2E

## Связи

- [[Dev Workflow]] — команды
- [[Backend Architecture]] — где лежат тесты
- [[Frontend Architecture]] — Playwright, Storybook
