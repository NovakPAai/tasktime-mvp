# MVP2JIRA — План реализации ТЗ

**Дата:** 2026-04-23
**Источник:** гэп-анализ админки TaskTime vs коробочная Jira ([admin-vs-jira-comparison.html](../../admin-vs-jira-comparison.html))
**Статус:** OPEN — утверждён список ТЗ и решения по скоупу, реализация не начата

---

## 1. Контекст

Эта папка (`docs/tz/MVP2JIRA/`) содержит 14 отдельных ТЗ, закрывающих разрыв между текущей админкой TaskTime и минимально-приемлемой (MVP-ready) админкой в Jira-стиле. Список ТЗ, их приоритеты и все архитектурные решения — результат пошагового review c владельцем продукта.

**Скоуп MVP2JIRA:** довести админку до состояния, когда систему объективно можно включать в прод для корпоративного заказчика. Всё, что вынесено в P3, — осознанно отложено.

**Что осознанно НЕ делаем (P3 / out-of-scope):**
- Backup/Restore на уровне приложения — закрывается через DevOps (pg_dump cron, снэпшоты дисков, версионирование кода в Git).
- Интернационализация (i18n) — переведены UI строки и email-шаблоны останутся на русском.
- Independent Permission Scheme (текущая Role Scheme с 33 флагами закрывает 95% use-case'ов).
- Incoming mail handlers, Services cron UI, DB Integrity Checker, Application Links, License management.

---

## 2. Сводная таблица ТЗ

| # | Ключ | Фаза | Объём | Зависит от | Блокирует | Параллельно с |
|---|------|------|-------|------------|-----------|---------------|
| 1 | [TTBUS-0](./TTBUS-0.md) | P0-prereq | 54ч (1.5сп) | — | **TTNOTIF-1, TTINTEG-1** | TTRES-1, TTSEC-3 |
| 2 | [TTNOTIF-1](./TTNOTIF-1.md) | P0 | 110ч (2сп) | **TTBUS-0** | TTINTEG-1 | TTSEC-3 (integrate) |
| 3 | [TTRES-1](./TTRES-1.md) | P0 | 33ч (0.5сп) | — *(TTCORE-1 желателен)* | — | всё |
| 4 | [TTSEC-3](./TTSEC-3.md) | P0 | 52ч (1сп) | — | TTNOTIF-1 (recipient filter) | всё |
| 5 | TTSSO-1 | P1 | 2сп | — | — | всё |
| 6 | TTSEC-4 | P1 | 1сп | — | TTMFA-1 (re-auth integration) | всё |
| 7 | TTCORE-1 | P1 | 1сп | — | *(TTRES-1 желает)* | всё |
| 8 | TTPROJ-1 | P1 | 1сп | — | — | всё |
| 9 | TTSCR-1 | P1 | 0.5сп | — | — | всё |
| 10 | TTATTACH-1 | P1 | 1.5сп | — | **TTBRAND-1** | всё |
| 11 | TTMFA-1 | P2 | 1сп | TTSEC-4 *(рекомендовано)* | — | всё |
| 12 | TTINTEG-1 | P2 | 1сп | **TTBUS-0, TTNOTIF-1** | — | всё |
| 13 | TTCFG-1 | P2 | 0.5сп | — | — | всё |
| 14 | TTBRAND-1 | P2 | 0.5сп | **TTATTACH-1** | — | всё |

**Итого:** ~14.5 спринтов работы (29 недель при full-time работе одной команды без параллелизма).

**Обозначения:**
- **Жирным** — жёсткие блокеры (без них нельзя начинать зависимое ТЗ).
- *Курсивом* — рекомендованные, но не блокирующие зависимости.

---

## 3. Граф зависимостей

```
                        ┌──────────┐
                        │ TTBUS-0  │ P0 prereq (1.5сп)
                        └────┬─────┘
                             │
                   ┌─────────┴──────────┐
                   ▼                    ▼
          ┌──────────────┐      ┌──────────────┐
          │  TTNOTIF-1   │      │  TTINTEG-1   │ P2 (1сп)
          │ P0 (2сп)     │──┐   │              │
          └──────────────┘  │   └──────────────┘
                            │          ▲
                            └──────────┘
                            (TTINTEG-1 также зависит от NOTIF-1
                             как reference consumer паттерн)

  ┌────────────┐  ┌────────────┐
  │ TTRES-1    │  │ TTSEC-3    │   P0 — independent, can run any time
  │ (0.5сп)    │  │ (1сп)      │
  └────────────┘  └────────────┘
        │
        │ (желательно после TTCORE-1 для status category alignment)
        ▼
  ┌────────────┐
  │ TTCORE-1   │   P1 — independent (1сп)
  └────────────┘

  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │ TTSEC-4    │  │ TTSSO-1    │  │ TTPROJ-1   │  │ TTSCR-1    │
  │ (1сп)      │  │ (2сп)      │  │ (1сп)      │  │ (0.5сп)    │
  └─────┬──────┘  └────────────┘  └────────────┘  └────────────┘
        │
        ▼
  ┌────────────┐
  │ TTMFA-1    │  P2 (1сп) — reuses re-auth infra from TTSEC-4
  └────────────┘

  ┌────────────┐
  │ TTATTACH-1 │  P1 (1.5сп)
  └─────┬──────┘
        │ (storage abstraction)
        ▼
  ┌────────────┐
  │ TTBRAND-1  │  P2 (0.5сп)
  └────────────┘

  ┌────────────┐
  │ TTCFG-1    │  P2 (0.5сп) — полностью независимое
  └────────────┘
```

**Критическая цепочка (самый длинный путь):**
`TTBUS-0 → TTNOTIF-1 → TTINTEG-1` = 1.5 + 2 + 1 = **4.5 спринта**.

Это нижняя граница времени выполнения при любом уровне параллелизма.

---

## 4. Рекомендованный порядок — Single Team

Для одной команды full-time (4–5 backend + 2 frontend).

### Волна 1 — Фундамент P0 (спринты 1–5)

| Спринт | ТЗ | Причина |
|--------|-----|---------|
| 1 | TTBUS-0 | критический путь, без него notifications не работает |
| 2 | TTBUS-0 (завершение) + TTSEC-3 | TTSEC-3 запускается параллельно (independent) |
| 3 | TTNOTIF-1 + TTRES-1 | NOTIF — консьюмер поверх BUS; RES — independent короткий |
| 4 | TTNOTIF-1 (завершение) | |
| 5 | TTCORE-1 | перед остальными P1 — меняет `Priority`/`Status` модель, влияет на все формы |

**Gate 1 (после спринта 5):** P0 полностью закрыт — MVP запускаем в пилот. Без SSO/MFA/Attachments, но с уведомлениями, resolution'ами, security.

### Волна 2 — P1 (спринты 6–12)

| Спринт | ТЗ | Комментарий |
|--------|-----|-------------|
| 6 | TTSEC-4 + TTSCR-1 | P1 security (password policy + audit + banner) + screens (малое) |
| 7 | TTSSO-1 | большое, приоритет для корп-заказчиков |
| 8 | TTSSO-1 (завершение) + TTPROJ-1 | components + versions |
| 9 | TTATTACH-1 | функционал вложений |
| 10 | TTATTACH-1 (завершение) | |
| 11 | — резерв на багфиксы P1 — | |

**Gate 2 (после спринта 11):** P1 закрыт — платформа корпоративно-приемлемая.

### Волна 3 — P2 (спринты 12–14)

| Спринт | ТЗ | Комментарий |
|--------|-----|-------------|
| 12 | TTMFA-1 + TTCFG-1 | 2FA (после SEC-4) + time-tracking parser |
| 13 | TTINTEG-1 | webhooks admin UI |
| 14 | TTBRAND-1 + резерв | look & feel + финальная полировка |

**Gate 3:** Production-ready по всем 14 ТЗ.

**Итого single-team: ~14 спринтов.**

---

## 5. Рекомендованный порядок — Two Parallel Teams

Если есть две команды (или one команда с двумя независимыми треками), можно сжать до **~9 спринтов**.

### Track A — Backend-heavy (Event Bus & Notifications critical path)

| Спринт | ТЗ |
|--------|-----|
| 1 | TTBUS-0 |
| 2 | TTBUS-0 завершение |
| 3 | TTNOTIF-1 |
| 4 | TTNOTIF-1 |
| 5 | TTINTEG-1 (после NOTIF — reuse patterns) |
| 6 | TTCFG-1 + резерв |
| 7–9 | баги, доработки, production hardening |

### Track B — Admin & Model changes (parallel)

| Спринт | ТЗ |
|--------|-----|
| 1 | TTSEC-3 + TTRES-1 (оба independent) |
| 2 | TTCORE-1 (priorities + status reconciliation) |
| 3 | TTSEC-4 + TTSCR-1 |
| 4 | TTSSO-1 |
| 5 | TTSSO-1 + TTPROJ-1 |
| 6 | TTATTACH-1 |
| 7 | TTATTACH-1 + TTMFA-1 |
| 8 | TTMFA-1 + TTBRAND-1 |
| 9 | финализация |

**Точки синхронизации:**
- Конец спринта 2: Track A должен выдать TTBUS-0 до старта NOTIF в спринте 3.
- Конец спринта 4: Track B TTSEC-3 к моменту завершения TTNOTIF-1 в Track A для интеграции visibility-фильтра.

**Итого two-team: ~9 спринтов.**

---

## 6. Почему такой порядок — обоснование ключевых решений

### 6.1 Почему TTBUS-0 первый
- Без шины событий нельзя асинхронно отсылать уведомления.
- Transactional outbox — инфраструктурный паттерн, который меняет сигнатуру bool-методов (producer'ы должны вызывать `publishInTx`). Ретрофит-делать это потом значительно дороже — придётся переписывать десятки методов.
- Reference implementation в issues-модуле задаёт паттерн для всех будущих producer'ов (comments, releases, workflow).

### 6.2 Почему TTSEC-3 в параллель с BUS-0
- Visibility-фильтр нужно ввести **до** TTNOTIF-1 — иначе notifications начнут утекать PRIVATE-задачи в email.
- Полностью independent от BUS-0 (изолированный RBAC-middleware).

### 6.3 Почему TTCORE-1 перед большинством P1
- Миграция `IssuePriority` enum → таблица и reconciliation `IssueStatus` затрагивает каждую форму, фильтр, TTQL-компилятор.
- Если сделать после TTSSO/TTATTACH/TTSCR — придётся дважды трогать UI-формы.
- Риск: большая миграция данных. Мерж раньше → больше времени на обнаружение багов.

### 6.4 Почему TTSSO-1 до TTMFA-1
- TTSSO выключает локальные пароли для большинства пользователей (3.1.HH=3 — локальный login только для SUPER_ADMIN).
- TTMFA только для локального логина релевантен (SSO-провайдер сам делает MFA).
- Сделав SSO первым, сокращаем surface для TTMFA (применяется только к ~2–5 админам).

### 6.5 Почему TTATTACH-1 до TTBRAND-1
- TTBRAND-1 (3.4.UUUU=1) переиспользует storage-абстракцию из TTATTACH-1. Иначе придётся писать временную.

### 6.6 Почему TTINTEG-1 последним из критических
- Webhooks — внешняя интеграция, не блокирует внутренних пользователей.
- Переиспользует всю инфру TTBUS-0 + pattern'ы TTNOTIF-1 (consumer-dedup, retry, DLQ).
- Отложив его, мы максимизируем reuse и минимизируем rework.

---

## 7. Gates / точки фиксации

### Gate 0 — Пре-Wave 1 (утверждение ТЗ)
- [x] Все 14 ТЗ написаны и лежат в `docs/tz/MVP2JIRA/`.
- [ ] Ревью ТЗ стейкхолдерами (архитектор, SRE, security lead).
- [ ] Утверждён владелец каждого ТЗ.
- [ ] Создана Kafka-инфра в dev (TTBUS-0 precondition).

### Gate 1 — После P0 (конец волны 1)
- [ ] 4 P0-ТЗ замержены и выкачены в staging.
- [ ] SMTP настроен, Notifications идут.
- [ ] Issue Security покрыт security-test suite.
- [ ] Resolution миграция выполнена на копии prod-БД, аномалий нет.
- [ ] Пилотная группа (1 команда, ~10 чел) работает в staging 2 недели, собран фидбек.

### Gate 2 — После P1
- [ ] SSO подключён минимум к одному IdP (Keycloak).
- [ ] Attachments работают, storage pluggable.
- [ ] Components/Versions в TTQL + UI.
- [ ] Password policy + audit log UI в админке.

### Gate 3 — После P2 (production-ready)
- [ ] 2FA опциональна, обязательна для ADMIN/SUPER_ADMIN.
- [ ] Webhooks admin UI работает, HMAC-signing проверен внешним receiver'ом.
- [ ] Look & Feel настроен (логотип, цвета, footer, email-logo).
- [ ] Time tracking парсер `1w 2d` работает.

---

## 8. Риски всего плана

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | TTBUS-0 затягивается — блокирует TTNOTIF/TTINTEG | Средняя | Сдвиг всех волн на 2+ спринта | Выделить самого опытного backend-инженера; параллельно готовить шаблоны TTNOTIF-1, чтобы сразу после merge BUS-0 стартовать |
| 2 | Миграция данных TTCORE-1 на prod-БД находит неочевидные edge-cases (NULL, orphaned refs) | Высокая | Downtime / откат релиза | Прогон миграции на снимке prod-БД 2 недели до релиза; dry-run mode в скрипте |
| 3 | Visibility-фильтр TTSEC-3 пропущен в одном из list-путей — security-leak | Средняя | Компрометация | Единая библиотека `visibilityWhereClause`; security-review обязательный на merge; фаззинг-тесты |
| 4 | SSO не подключается к конкретному корп-IdP из-за нестандартных claim-mappings | Средняя | Срыв дат у корп-клиента | Ранний POC на pilot-IdP за 1–2 недели до старта TTSSO-1; fallback — локальный логин для SUPER_ADMIN |
| 5 | Команда перегружена → качество P2-ТЗ страдает (срезают тесты) | Средняя | Прод-баги через неск. месяцев | Каждое ТЗ имеет отдельный «AI review» step в CI; блок merge без green pipeline |
| 6 | Заказчик требует «сразу всё» без Gate-approach | Низкая | Neverending перекидывание приоритетов | Gate'ы зафиксированы этим документом; изменения scope — через явное PR в этот файл |
| 7 | Kafka оказывается недостаточна для нагрузки (>5000 events/sec на будущих feature'ах) | Низкая | Перепланирование инфры | В TTBUS-0 partitioning готов; scale — отдельное ТЗ при фактической деградации |

---

## 9. Метрики успеха

После закрытия всех Gate:
- **Coverage vs Jira vanilla:** целевое 90%+ (против 55% на старте).
- **Time-to-first-notification:** < 60 сек от события до email (p95).
- **Authentication methods:** локальный + OIDC, 2FA для SUPER_ADMIN.
- **API uptime:** 99.5% в staging, 99.9% в prod.
- **Security audit findings:** 0 critical, ≤ 2 major после penetration-теста.

---

## 10. Что делать после закрытия MVP2JIRA

Roadmap следующей итерации (out-of-scope этого плана):
- **TTAUTO-1** — Automations (async ScriptRunner аналог). Инфра уже готова (TTBUS-0 + consumer pattern).
- **TTINTEG-2** — Public Events API (pull-based + WebSocket stream).
- **TTPERM-1** — Independent Permission Scheme (если потребуется).
- **TTMAIL-2** — Incoming Mail Handlers (создание issue из email).
- **TTI18N-1** — Internationalization (RU+EN+...) — если появятся international клиенты.
- **TTBACKUP-1** — Admin-level backup/restore UI (если DevOps-процесс окажется недостаточным).

---

## Ссылки

- [Гэп-анализ](../../admin-vs-jira-comparison.html) — исходный отчёт.
- [TTBUS-0](./TTBUS-0.md) — Event Bus.
- [TTNOTIF-1](./TTNOTIF-1.md) — Notifications.
- [TTRES-1](./TTRES-1.md) — Resolutions.
- [TTSEC-3](./TTSEC-3.md) — Issue Security.
- *(оставшиеся 10 ТЗ появятся в волнах 2 и 3)*
