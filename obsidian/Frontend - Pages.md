---
tags: [frontend, pages, react]
---

# Frontend — Pages

Path: `frontend/src/pages/` — 42 страницы

## Core Pages

| Страница | URL | Описание |
|---------|-----|---------|
| `LoginPage` | `/login` | Форма входа, опция регистрации |
| `ChangePasswordPage` | `/change-password` | Принудительная смена пароля |
| `DashboardPage` | `/` | Дашборд: статистика, последние задачи, спринты |
| `ProjectsPage` | `/projects` | Карточки проектов |
| `ProjectDetailPage` | `/projects/:id` | Настройки проекта, команды, воркфлоу |
| `BoardPage` | `/projects/:id/board` | Kanban (drag-n-drop) |
| `SprintsPage` | `/projects/:id/sprints` | Спринты проекта |
| `GlobalSprintsPage` | `/sprints` | Кросс-проектные спринты |
| `IssueDetailPage` | `/issues/:id` | Детали задачи: поля, история, комментарии, тайм-логи |
| `TimePage` | `/time` | Таймер + журнал времени + отчёт |
| `TeamsPage` | `/teams` | Управление командами |
| `BusinessTeamsPage` | `/teams/business` | Бизнес-команды |
| `FlowTeamsPage` | `/teams/flow` | Flow-команды |
| `ReleasesPage` | `/releases` | Релизы проекта |
| `GlobalReleasesPage` | `/releases/global` | Глобальный вид релизов |
| `PipelineDashboardPage` | `/pipeline` | Pipeline: batch создание, деплой, тест, релиз |
| `SettingsPage` | `/settings` | Настройки пользователя (тема) |
| `UatTestsPage` | `/uat` | UAT тест-сценарии |

## Admin Pages (13+)

| Страница | Что настраивает |
|---------|----------------|
| `AdminPage` | Hub |
| `AdminDashboardPage` | Метрики системы |
| `AdminUsersPage` | Пользователи + роли |
| `AdminProjectsPage` | Проекты |
| `AdminSystemPage` | Системные настройки |
| `AdminIssueTypeSchemesPage` | Схемы типов задач |
| `AdminIssueTypeConfigsPage` | Типы задач (EPIC, STORY...) |
| `AdminWorkflowsPage` | Воркфлоу |
| `AdminWorkflowEditorPage` | Редактор воркфлоу (xyflow) |
| `AdminWorkflowSchemesPage` | Схемы воркфлоу |
| `AdminWorkflowStatusesPage` | Статусы |
| `AdminReleaseWorkflowsPage` | Release workflows |
| `AdminCustomFieldsPage` | Кастомные поля |
| `AdminFieldSchemasPage` | Схемы полей |
| `AdminTransitionScreensPage` | Экраны переходов |
| `AdminLinkTypesPage` | Типы связей |
| `AdminMonitoringPage` | Здоровье системы |

## Связи

- [[Frontend Architecture]] — общая структура
- [[Frontend - Stores]] — глобальный стейт
- [[Frontend - API Client]] — HTTP-запросы
