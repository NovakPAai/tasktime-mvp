# Production Readiness Sprints: 22 задачи для AI Developer

**Статус:** Созданы ТЗ для всех спринтов
**Дата:** 2026-03-28
**Статус план:** Утверждён в `/Users/pavelnovak/.claude/plans/wondrous-imagining-journal.md`
**Порядок:** Security A → B → C (15-20 дней) + Infrastructure A → B → C (10-15 дней) = 4-5 недель

---

## Sprint Security A: OIDC + MFA + Session Management (AI-100)
**Длительность:** 7-10 дней
**Приоритет:** CRITICAL — Блокер для production

### AI-100.1: OIDC интеграция с Keycloak (dev/staging setup)
- Развернуть локальный Keycloak в Docker Compose для dev/staging
- Интегрировать `passport-openid-connect` в Express backend
- Feature flag `AUTH_PROVIDER`: `keycloak-local` (dev) vs `keycloak-ib` (prod)
- Логирование попыток входа (успех/неудача с IP)
- **AC:** Можем логиниться через локальный Keycloak на localhost:8080

### AI-100.2: MFA интеграция с Avanpost (mock для dev)
- Создать mock/stub для Avanpost в dev/staging
- Feature flag `MFA_PROVIDER`: `mock` (dev) vs `avanpost` (prod)
- Логирование попыток MFA (успех/неудача)
- Определить критичные операции, требующие MFA (удаление пользователя, смена прав и т.д.)
- **AC:** Mock MFA работает в dev, CI тесты проходят

### AI-100.3: Session Management с Session ID и feature flags
- Добавить Session ID во все запросы и логи
- Redis для хранения session metadata
- Отслеживание: login time, last activity, logout reason
- Feature flag для переключения между OIDC (prod) и локальной (dev) сессией
- **AC:** Session ID видно во всех логах, Redis хранит metadata

---

## Sprint Security B: Audit Logging + SIEM + ГОСТ 57580 (AI-101)
**Длительность:** 7-10 дней
**Приоритет:** CRITICAL — ФЗ-152 compliance

### AI-101.1: Структурированное логирование (JSON + Session ID)
- Логирование в структурированном JSON формате
- Session ID во всех логах
- Dev/Staging: файл `/var/log/tasktime/audit.log`
- Prod: `LOGGING_SINK=kuma-ib` feature flag
- **AC:** Все логи содержат {timestamp, sessionId, userId, action, object}

### AI-101.2: Prisma audit middleware (ФЗ-152 compliance)
- Регистрация всех create/update/delete операций в аудит таблицу
- Формат: timestamp, sessionId, subject, action, object, technologicalArea, siemsTag
- Dev: логирование в БД + файл
- Prod: гарантированная доставка в KUMA (BullMQ retry queue)
- Реагирование на отказ доставки (очередь, диск заполнен и т.д.)
- **AC:** Все мутации регистрируются в audit_log, нет потери событий

### AI-101.3: KUMA/Graylog integration (dev/prod с feature flags)
- Dev/Staging: Mock KUMA client или Graylog (бесплатный аналог)
- Prod: API для отправки событий в KUMA ИБ
- Feature flag `KUMA_PROVIDER`: `local|graylog` (dev) vs `kuma-ib` (prod)
- Retry policy для гарантированной доставки (BullMQ)
- Уточнить с ИБ: endpoint, authentication, format
- **AC:** События отправляются в выбранный приёмник, retry работает при сбое

### AI-101.4: Event-driven audit trail (ГОСТ 57580)
- Реестр всех типов событий: AUTH_SUCCESS, AUTH_FAILURE, SESSION_START/END, USER_CREATED/MODIFIED/DELETED, ROLE_MODIFIED, CONFIG_CHANGED, SERVICE_RESTARTED, SOFTWARE_UPDATED и т.д.
- Маппинг на УЗП/РД коды ГОСТ 57580 (только применимые — БЕЗ финансовых ops и внешних клиентов)
- Логирование с technologicalArea (ИАА, ФПП и т.д.)
- **AC:** Все события логируются с правильными ГОСТ кодами

---

## Sprint Security C: RBAC по полям + API access control (AI-102)
**Длительность:** 3-5 дней
**Приоритет:** HIGH — Field-level granularity

### AI-102.1: PostgreSQL Row-Level Security (RLS) для sensitive data
- Policy per role (employee видит только свои задачи, manager видит своих и подчинённых)
- Например: `CREATE POLICY view_own_issues ON issues FOR SELECT USING (assigned_to = current_user_id);`
- Тестирование RLS политик (unit + integration)
- **AC:** RLS политики работают, employee видит только свои задачи

### AI-102.2: API access control (read/write/delete per field)
- Расширить разграничение доступа на уровне fields
- Использовать Casbin или Permify для гибкого ABAC
- Валидация при каждом API call
- **AC:** API отклоняет запросы без прав на поле, E2E тесты проходят

---

## Sprint Infrastructure A: E2E, Docker, Health Checks (AI-103)
**Длительность:** 3-5 дней
**Приоритет:** HIGH — Production readiness

### AI-103.1: Playwright E2E тесты (3 critical paths)
- Тест 1: Login → Dashboard → Create issue
- Тест 2: Kanban board → drag-n-drop issue
- Тест 3: Time tracking → start/stop timer
- Интеграция в CI.yml (запуск на каждый PR)
- **AC:** 3 Playwright теста зелёные, в CI они выполняются

### AI-103.2: Docker улучшения (dumb-init + non-root + alpine)
- Перейти с ubuntu базе на alpine (`node:22-alpine`)
- Добавить `dumb-init` для правильной обработки SIGTERM
- Создать non-root user (`nodejs:nodejs`, UID 1001)
- Docker healthcheck для проверки API
- **AC:** Образ работает на alpine, SIGTERM обрабатывается корректно

### AI-103.3: Health check endpoint (расширенный)
- Проверка БД (`SELECT 1`)
- Проверка Redis (`PING`)
- Проверка памяти
- `GET /api/health` возвращает 200 (ok) или 503 (degraded)
- **AC:** `/api/health` работает, Docker healthcheck использует его

---

## Sprint Infrastructure B: Logging, Queue, Graceful Shutdown (AI-104)
**Длительность:** 3-5 дней
**Приоритет:** HIGH — Async processing + logging

### AI-104.1: Prisma middleware для audit (ФЗ-152 compliance)
- Использовать `prisma-client-extensions` для middleware
- Логирование всех мутаций (create/update/delete)
- Формат: `{timestamp, userId, action, model, recordId, payload}`
- **AC:** Все мутации логируются, Prisma middleware работает

### AI-104.2: Winston logger (структурированные логи вместо console.log)
- Замена `console.log` на `winston.info/warn/error`
- JSON format для парсирования в ELK/Splunk
- Daily rotation + archiving
- Уровни: debug, info, warn, error
- **AC:** Логи в JSON, daily rotation работает

### AI-104.3: BullMQ queue для async processing
- Email notifications (async через очередь)
- CSV export (long-running job)
- GitLab webhook processing (async)
- Report generation (async)
- Concurrency: 20-50 jobs
- **AC:** BullMQ работает, jobs обрабатываются асинхронно

### AI-104.4: Graceful shutdown handler (SIGTERM)
- Обработка SIGTERM signal в `app.ts`
- Закрытие активных connections (PostgreSQL, Redis)
- Ожидание завершения in-flight requests (timeout 30s)
- Отправка event в SIEM при shutdown
- **AC:** При `kill -TERM` процесс закрывается корректно

---

## Sprint Infrastructure C: Production Polish (AI-105)
**Длительность:** 2-3 дня
**Приоритет:** MEDIUM — Final adjustments

### AI-105.1: Staging secrets в GitHub (BLOCKING deploy staging)
- Settings → Environments → staging
- Добавить: `STAGING_DEPLOY_SSH_KEY`, `STAGING_DEPLOY_HOST`, `STAGING_DEPLOY_USER`, `STAGING_DEPLOY_PATH`
- Или отключить auto-deploy staging (если не готово)
- **AC:** Staging deploy workflow успешно выполняется

### AI-105.2: Systemd unit file для Astra Linux
- `/etc/systemd/system/tasktime.service`
- `ExecStart: docker compose up`
- `ExecStop: docker compose down`
- Restart policy: `on-failure`
- User: `tasktime`
- **AC:** `systemctl start tasktime` работает на Astra Linux

### AI-105.3: Vitest migration (Jest → Vitest, 3x faster)
- Переход с Jest на Vitest
- Обновить конфигурацию (`vitest.config.ts`)
- Обновить CI.yml
- Проверить все тесты зелёные (не должно быть регрессии)
- **AC:** Все тесты проходят на Vitest, CI быстрее

### AI-105.4: Coverage tracking (target: 80%+ for main modules)
- Настройка vitest coverage
- Target: 80%+ для основных модулей (auth, projects, issues, users)
- CI блокирует если coverage упадёт
- Report в GitHub PR
- **AC:** Coverage трекинг работает, минимум 80%

---

## Резюме: 22 задачи, 6 спринтов

| # | Sprint | Статус | Дней | Задач |
|----|--------|--------|------|-------|
| 1 | Security A (OIDC + MFA) | 📋 | 7-10 | 3 |
| 2 | Security B (Logging + SIEM) | 📋 | 7-10 | 4 |
| 3 | Security C (RBAC по полям) | 📋 | 3-5 | 2 |
| 4 | Infrastructure A (E2E + Docker) | 📋 | 3-5 | 3 |
| 5 | Infrastructure B (Logging + Queue) | 📋 | 3-5 | 4 |
| 6 | Infrastructure C (Polish) | 📋 | 2-3 | 4 |
| | **ИТОГО** | | **25-33** | **22** |

**Next Step:** Создать эти задачи в TaskTime через API или UI

---

## Параллельный поток: Reference Analysis

Рекомендуемые проекты для анализа архитектурных паттернов (параллельно с разработкой):

1. **Baserow** (4.5k⭐) → RBAC + audit logging patterns
2. **Directus** (34.5k⭐) → Dynamic API + audit middleware
3. **Wekan** (20k⭐) → Kanban board drag-n-drop
4. **n8n** (181k⭐) → Workflow automation + GitLab webhook
5. **Corteza** (2k⭐) → Configurable forms
6. **Redash** (28k⭐) → Analytics dashboard

---

## Feature Flags для dev/prod переключения

```typescript
// config/environment.ts
export const AUTH_CONFIG = {
  dev: {
    provider: 'keycloak-local',
    keycloakUrl: 'http://localhost:8080',
  },
  prod: {
    provider: 'keycloak-ib',
    keycloakUrl: process.env.KEYCLOAK_IB_URL,
  },
};

export const MFA_CONFIG = {
  dev: {
    provider: 'mock',
  },
  prod: {
    provider: 'avanpost',
    apiUrl: process.env.AVANPOST_API_URL,
    apiKey: process.env.AVANPOST_API_KEY,
  },
};

export const LOGGING_CONFIG = {
  dev: {
    sink: 'file', // /var/log/tasktime/audit.log
  },
  prod: {
    sink: 'kuma-ib',
    kumaUrl: process.env.KUMA_API_URL,
    kumaAuth: process.env.KUMA_API_KEY,
  },
};
```

---

## План создания задач в TaskTime

Задачи созданы в этом документе. Для внесения в систему:

```bash
# API endpoint
POST /api/issues

# Payload для каждой задачи
{
  "projectId": "TTMP",  // или FLOW
  "epicId": "AI-100/101/102/103/104/105",
  "summary": "Название задачи",
  "description": "AC + детали",
  "issueType": "TASK",
  "priority": "HIGH",
  "estimatedHours": 8-40 (в зависимости от сложности)
}
```

**Статус:** Готовы к загрузке в систему. Ждём запуска реализации.

