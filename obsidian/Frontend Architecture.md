---
tags: [architecture, frontend]
---

# Frontend Architecture

Path: `frontend/src/`

## Стек

- **React 18** + **Vite** + **TypeScript**
- **Ant Design 5** — UI компоненты
- **Zustand 5** — глобальный стейт
- **Axios** — HTTP клиент (с interceptor для token refresh)
- **@hello-pangea/dnd** — drag-n-drop на Kanban
- **@xyflow/react** — диаграммы воркфлоу
- **React Router 7** — роутинг
- **React Markdown** — рендер описаний

## Структура

```
frontend/src/
├── pages/          # 42 страницы-компонента
├── api/            # 27 API-клиентов (axios)
├── store/          # 6 Zustand-сторов
├── types/          # TypeScript типы
└── components/     # Переиспользуемые компоненты
```

## Страницы → [[Frontend - Pages]]

## Сторы → [[Frontend - Stores]]

## API-клиент → [[Frontend - API Client]]

## Роуты приложения

| URL | Страница |
|-----|---------|
| `/login` | LoginPage |
| `/` | DashboardPage |
| `/projects` | ProjectsPage |
| `/projects/:id` | ProjectDetailPage |
| `/projects/:id/board` | BoardPage |
| `/projects/:id/sprints` | SprintsPage |
| `/issues/:id` | IssueDetailPage |
| `/time` | TimePage |
| `/teams` | TeamsPage |
| `/releases` | ReleasesPage |
| `/admin/*` | Admin Pages (13) |

## State Management

```
Server state   → Axios API calls (no React Query yet)
Global state   → Zustand stores (auth, theme, issues, projects, ui)
Local state    → useState (forms, local UI)
```

## Связанное

- [[Architecture Overview]]
- [[Module - Auth]] — login flow
- [[Module - Issues]] — issue list, filters
- [[Module - Boards]] — Kanban
