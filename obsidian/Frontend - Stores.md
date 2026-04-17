---
tags: [frontend, zustand, state]
---

# Frontend — Stores

Path: `frontend/src/store/` — 6 Zustand-сторов

## auth.store.ts

```typescript
state:   { user, token, refreshToken, isLoading }
actions: setUser, setToken, setRefreshToken, logout, checkAuth
```

- Персистируется в localStorage
- `checkAuth` — проверяет и обновляет токен при старте
- Связан с [[Module - Auth]]

## theme.store.ts

```typescript
state:   { mode: 'light' | 'dark' }
actions: setMode, toggleMode
```

- Персистируется, меняет Ant Design тему

## issues.store.ts

```typescript
state:   { issues[], selectedId, filters, isLoading }
actions: setIssues, selectIssue, updateIssue, addIssue, deleteIssue, setFilters
```

- Кэш списка задач
- Связан с [[Module - Issues]]

## projects.store.ts

```typescript
state:   { projects[], selectedId, currentProject, isLoading }
actions: setProjects, selectProject, updateProject, addProject
```

- Кэш проектов
- Связан с [[Module - Projects]]

## ui.store.ts

```typescript
state:   { sidebarOpen, modalVisible, notificationQueue[] }
actions: setSidebarOpen, openModal, closeModal, addNotification
```

## uatOnboarding.store.ts

```typescript
state:   { completed, currentStep, data }
actions: nextStep, completeStep, resetFlow
```

- UAT-флоу для тестирования фич

## Связи

- [[Frontend Architecture]] — архитектура
- [[Frontend - API Client]] — данные приходят через axios
- [[Frontend - Pages]] — страницы читают/пишут сторы
