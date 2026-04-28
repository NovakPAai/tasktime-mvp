# MVP2JIRA — Индекс ТЗ

**Дата:** 2026-04-23
**План реализации:** [mvp2jira_plan.md](./mvp2jira_plan.md)
**Источник:** [admin-vs-jira-comparison.html](../../admin-vs-jira-comparison.html)

---

## Все ТЗ (14 штук)

| Ключ | Название | Фаза | Оценка | Статус |
|------|----------|------|--------|--------|
| [TTBUS-0](./TTBUS-0.md) | Event Bus (Kafka + Transactional Outbox) | **P0-prereq** | 54ч (1.5сп) | OPEN |
| [TTNOTIF-1](./TTNOTIF-1.md) | Notifications Service (Email + In-app Bell) | **P0** | 110ч (2сп) | OPEN |
| [TTRES-1](./TTRES-1.md) | Resolutions (результат закрытия задачи) | **P0** | 33ч (0.5сп) | OPEN |
| [TTSEC-3](./TTSEC-3.md) | Issue Security (уровни видимости задач) | **P0** | 52ч (1сп) | OPEN |
| [TTSSO-1](./TTSSO-1.md) | SSO / OIDC | **P1** | 102ч (2сп) | OPEN |
| [TTSEC-4](./TTSEC-4.md) | Password Policy + Audit Log UI + Banner | **P1** | 63ч (1сп) | OPEN |
| [TTCORE-1](./TTCORE-1.md) | Priorities CRUD + IssueStatus reconciliation | **P1** | 63ч (1сп) | OPEN |
| [TTPROJ-1](./TTPROJ-1.md) | Components + fix/affects Versions | **P1** | 48ч (1сп) | OPEN |
| [TTSCR-1](./TTSCR-1.md) | Screens (контекст видимости полей) | **P1** | 24ч (0.5сп) | OPEN |
| [TTATTACH-1](./TTATTACH-1.md) | Функционал вложений (Issue + Comment) | **P1** | 84ч (1.5сп) | OPEN |
| [TTMFA-1](./TTMFA-1.md) | 2FA / TOTP | **P2** | 68ч (1сп) | OPEN |
| [TTINTEG-1](./TTINTEG-1.md) | Webhooks (system + project) | **P2** | 70ч (1сп) | OPEN |
| [TTCFG-1](./TTCFG-1.md) | Time Tracking (parser + auto-stop) | **P2** | 23ч (0.5сп) | OPEN |
| [TTBRAND-1](./TTBRAND-1.md) | Look & Feel (брендинг) | **P2** | 32ч (0.5сп) | OPEN |

**Итого:** ~826 часов ≈ **14.5 спринтов** (одна команда full-time).

---

## По фазам

### P0 — Блокеры запуска (~249ч / 5сп)
1. **TTBUS-0** — фундамент event-bus. Блокирует TTNOTIF-1 и TTINTEG-1.
2. **TTNOTIF-1** — уведомления. Критично, без них трекер не полноценен.
3. **TTRES-1** — resolutions. Закрытие задач с причиной.
4. **TTSEC-3** — issue security. Скрытие отдельных задач.

### P1 — Критично для корп-использования (~384ч / 7сп)
5. **TTSSO-1** — SSO/OIDC.
6. **TTSEC-4** — password policy, audit UI, banner.
7. **TTCORE-1** — приоритеты + согласование статусов.
8. **TTPROJ-1** — components + versions.
9. **TTSCR-1** — screens (контекст полей).
10. **TTATTACH-1** — функционал вложений (в JIRA-отчёте было в P2, поднято до P1).

### P2 — Важно, но не блокирует (~193ч / 3сп)
11. **TTMFA-1** — 2FA.
12. **TTINTEG-1** — webhooks.
13. **TTCFG-1** — time tracking parser.
14. **TTBRAND-1** — брендинг.

---

## Осознанно НЕ реализовано (P3 / out-of-scope)

- **Backup/Restore на уровне приложения** — закрывается через DevOps (pg_dump cron, снэпшоты, git).
- **Интернационализация (i18n)** — UI остаётся RU-only.
- **Independent Permission Scheme** — текущая Role Scheme с 33 флагами достаточна.
- **Incoming mail handlers** — сценарий нечастотный, нет запроса от клиентов.
- **Services cron UI** — BullMQ dashboard покрывает need.
- **DB Integrity Checker** — применимо только после backup/restore, который тоже вынесен.
- **Application Links** — не нужно для self-hosted MVP.
- **License management** — специфично для коммерческой self-hosted модели.

Эти пункты могут появиться как отдельные roadmap-инициативы, если потребуется (см. `mvp2jira_plan.md` секция 10).

---

## Roadmap после MVP2JIRA

Инфраструктура, подготовленная в этом плане, открывает дешёвые доработки:

- **TTAUTO-1** — Automations (асинхронный аналог ScriptRunner). Уже готова event-bus (TTBUS-0), добавить consumer + DSL для правил.
- **TTINTEG-2** — Public Events API (pull + WebSocket stream).
- **TTI18N-1** — i18n при появлении international клиентов.
- **TTMAIL-2** — Incoming Mail Handlers.
- **TTAV-1** — Virus scanning для attachments (ClamAV через Kafka).
- **TTMFA-2** — WebAuthn/passkey в дополнение к TOTP.
- **TTSSO-2** — SAML2 и LDAP если пойдут запросы.

---

## Дерево зависимостей (сокращённо)

```
TTBUS-0 ─┬─► TTNOTIF-1 ─► TTINTEG-1
         │        ▲
         │        │ (уведомления TTSEC-3 violations)
         │        │
TTSEC-3 ─┼────────┘
         │
TTRES-1  (independent, желает TTCORE-1)
TTCORE-1 (independent)
TTSSO-1  (independent)
TTSEC-4 ─► TTMFA-1
TTPROJ-1 (independent)
TTSCR-1  (independent, желает TTPROJ-1)
TTATTACH-1 ─► TTBRAND-1
TTCFG-1  (independent)
```

---

## История изменений этого индекса

- **2026-04-23** — Создан. 14 ТЗ, ~826ч, все решения утверждены.
