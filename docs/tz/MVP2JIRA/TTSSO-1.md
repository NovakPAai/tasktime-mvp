# ТЗ: TTSSO-1 — SSO (OpenID Connect)

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P1 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Сейчас аутентификация только локальная (email + пароль). Это блокер для корп-заказчиков: требуется интеграция с корпоративным IdP (Keycloak, Azure AD, GitLab, Google Workspace).

Задача вводит **OIDC-based SSO**:
- Множество одновременно активных провайдеров (список на логин-экране).
- **JIT-provisioning** — новый SSO-юзер создаётся автоматически.
- Автоматический **маппинг групп** по claim `groups` (match by name, несуществующие — игнор).
- **Локальный логин выключается** для всех, кроме SUPER_ADMIN (emergency backdoor).
- Связывание существующих локальных аккаунтов через **confirm dialog** (ввод старого пароля).
- **Периодическая sync** из IdP (опционально, требует admin-scope в IdP).
- **Системные роли — только `USER`** при JIT, `ADMIN`/`SUPER_ADMIN` выдаются админом вручную.

### Пользовательские сценарии

**Первый логин через SSO:**
1. Юзер на логин-экране видит список: «Войти через Keycloak», «Войти через GitLab».
2. Кликает «Войти через Keycloak» → редирект на `/realms/corp/.well-known/openid-configuration/auth?...`.
3. Успешный callback → получены claims `{ sub, email, name, groups: [...] }`.
4. В БД нет `UserIdentity` с таким `sub` и нет User c таким `email` → JIT: создаётся User с `USER` role + UserIdentity.
5. Группы из claim мапятся по имени на существующие `UserGroup` — проставляются в `UserGroupMember`.

**Связывание с существующим локальным аккаунтом:**
1. Alice уже имеет локальный `alice@corp.ru`. Включён SSO.
2. Alice входит через IdP, claim `email=alice@corp.ru`.
3. Backend находит существующего User с тем же email → **не создаёт дубль**, возвращает на фронт `requiresLinking=true`.
4. Фронт показывает экран «Нашли аккаунт с таким email — свяжите ранее созданным паролем».
5. Alice вводит старый пароль → backend проверяет → создаёт `UserIdentity`, пароль отключает (nullable или флаг).

**Админ настраивает IdP:**
1. `/admin/sso/providers` → «Добавить провайдера».
2. Имя `Keycloak`, protocol `OIDC`, issuer `https://keycloak.corp.ru/realms/main`, clientId/clientSecret.
3. Scopes `openid profile email groups`, claim mapping.
4. «Сохранить» → иконка появляется на логин-экране.

---

## 2. Текущее состояние

- Аутентификация — локальная через `auth.service.ts` (JWT + bcrypt + mustChangePassword).
- Session через Redis + sliding session (TTMP-171).
- `UserSystemRole` enum: SUPER_ADMIN/ADMIN/RELEASE_MANAGER/USER/AUDITOR.
- `UserGroup` + `UserGroupMember` — есть (TTSEC-2).
- Библиотеки для OIDC в проекте нет.

---

## 3. Зависимости

### Модули backend (новые)
- [ ] `modules/sso/sso.service.ts` — OIDC-flow: auth-url, callback, token exchange, userinfo.
- [ ] `modules/sso/sso.router.ts` — endpoints `/sso/providers`, `/sso/login/:providerId`, `/sso/callback/:providerId`, `/sso/link`.
- [ ] `modules/sso/providers-admin.router.ts` — CRUD провайдеров.
- [ ] `modules/sso/sync.worker.ts` — периодический sync пользователей (cron).

### Модули backend (изменённые)
- [ ] `modules/auth/auth.service.ts` — блокировать локальный логин для не-SUPER_ADMIN при наличии активных IdP.
- [ ] `modules/auth/auth.router.ts` — добавить `/auth/providers` (возвращает активные провайдеры для login-экрана).

### Frontend
- [ ] `pages/LoginPage.tsx` — список SSO-кнопок.
- [ ] `pages/SsoCallbackPage.tsx` — обрабатывает redirect от IdP, показывает loading.
- [ ] `pages/SsoLinkPage.tsx` — confirm-dialog для линковки существующего аккаунта.
- [ ] `pages/admin/AdminSsoProvidersPage.tsx` — CRUD провайдеров.
- [ ] `components/admin/SsoProviderForm.tsx` — форма с полями issuer, clientId, etc.

### Модели данных (Prisma)
- [ ] `IdentityProvider` — новая таблица.
- [ ] `UserIdentity` — новая таблица (many-to-one User, UserIdentity).
- [ ] `User.passwordHash: String` → `String?` (nullable для SSO-only юзеров).

### Внешние зависимости
- [ ] `openid-client` — OIDC-клиент (Panva Filip, industry standard).
- [ ] Docker Keycloak — для dev-тестов (опционально).

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | `email` claim от IdP подменён через misconfiguration → account takeover при автолинке | Высокая | Compromise | Автолинк ВЫКЛЮЧЕН, только confirm-dialog с вводом старого пароля |
| 2 | IdP не возвращает `groups` claim или возвращает под другим именем | Высокая | Пустые группы | Настраиваемый `groupClaim` в IdP-конфиге; null → пропускаем sync |
| 3 | Периодический sync обращается к IdP с service-account — если прав недостаточно, silent fail | Средняя | Из IdP не приходят disabled-юзеры | `IdentityProvider.syncEnabled` — флаг (default off); если включён и упал — alert в audit-log |
| 4 | OIDC state/nonce не проверяются → CSRF на callback | Низкая | Compromise | `openid-client` делает это из коробки; явные тесты на подмену state |
| 5 | SUPER_ADMIN забыл свой пароль, SSO отвалилось — никто не зайдёт | Средняя | Недоступность админки | Emergency-CLI в runbook: `npm run admin:reset-password -- --email=...` |
| 6 | JIT-юзер получает системную роль через claim (security risk) | — | Privilege escalation | Системные роли **никогда** не мапятся из claims (только USER); ADMIN выдаётся tasktime-админом явно |
| 7 | clientSecret читается из БД plain | Высокая | Leak | Шифрование AES-256-GCM + `SSO_ENCRYPTION_KEY` из ENV, аналогично SMTP-паролю |

---

## 5. Особенности реализации

### 5.1 Модели

```prisma
enum SsoProtocol {
  OIDC
  // SAML2, LDAP — фазово, не в MVP
}

model IdentityProvider {
  id              String      @id @default(uuid())
  name            String      @unique  // отображаемое имя на логин-экране
  protocol        SsoProtocol @default(OIDC)
  issuer          String      // URL discovery, напр. https://keycloak.corp.ru/realms/main
  clientId        String      @map("client_id")
  clientSecretEnc String      @map("client_secret_enc")  // AES-GCM encrypted
  scopes          String[]    @default(["openid", "profile", "email", "groups"])
  emailClaim      String      @default("email") @map("email_claim")
  nameClaim       String      @default("name") @map("name_claim")
  groupClaim      String?     @map("group_claim")  // null → группы не синхронизируются
  redirectUri     String      @map("redirect_uri")  // должен совпадать c настроенным в IdP
  iconUrl         String?     @map("icon_url")
  isEnabled       Boolean     @default(true) @map("is_enabled")
  syncEnabled     Boolean     @default(false) @map("sync_enabled")
  syncIntervalMin Int         @default(60) @map("sync_interval_min")
  lastSyncAt      DateTime?   @map("last_sync_at")
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  identities      UserIdentity[]

  @@map("identity_providers")
}

model UserIdentity {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  providerId   String   @map("provider_id")
  externalSub  String   @map("external_sub")  // sub claim
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime @default(now())

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider IdentityProvider @relation(fields: [providerId], references: [id], onDelete: Restrict)

  @@unique([providerId, externalSub])
  @@index([userId])
  @@map("user_identities")
}

// User.passwordHash: String? — становится nullable (для SSO-only юзеров)
```

### 5.2 OIDC flow

```typescript
// GET /api/auth/providers — returns active providers for login page
// Response: [{ id, name, iconUrl, loginUrl: '/sso/login/:id' }, ...]

// GET /sso/login/:providerId
// 1. Load provider, build OIDC client via openid-client
// 2. Generate state + nonce, store in Redis (TTL 10 min): key = state, value = { providerId, nonce }
// 3. Redirect to provider.authorizationEndpoint with ?state=&nonce=&redirect_uri=&scope=

// GET /sso/callback/:providerId?code=&state=
// 1. Validate state from Redis, extract nonce
// 2. tokenSet = await client.callback(redirect_uri, { code, state }, { state, nonce })
// 3. userInfo = await client.userinfo(tokenSet.access_token)
// 4. Extract: sub, email, name, groups = userInfo[provider.groupClaim ?? 'groups']
// 5. Find UserIdentity by (providerId, sub) → existing: login + sync groups
// 6. Else: find User by email →
//    a. Found existing User: return { requiresLinking: true, userId, email } → фронт показывает confirm
//    b. Not found: JIT-create User + UserIdentity + sync groups
// 7. On login: issue JWT + refresh (same flow as local auth)

// POST /sso/link — body { providerId, externalSub, password }
// 1. Validate session for the link-request (from step 6a, stored in Redis with TTL 10 min)
// 2. Verify password against User.passwordHash
// 3. Create UserIdentity(userId, providerId, externalSub)
// 4. Optional: User.passwordHash = null (policy; default keep password but pre-empt usage for SSO-only policy)
// 5. Return JWT
```

### 5.3 Группы sync

```typescript
async function syncUserGroups(userId: string, claimGroupNames: string[]): Promise<void> {
  // 1. Найти существующие UserGroup по name, case-insensitive
  const groups = await prisma.userGroup.findMany({
    where: { name: { in: claimGroupNames, mode: 'insensitive' } },
  });
  const claimGroupIds = groups.map((g) => g.id);

  // 2. Текущие членства
  const current = await prisma.userGroupMember.findMany({
    where: { userId, source: 'SSO_SYNC' },
    select: { groupId: true },
  });
  const currentIds = current.map((m) => m.groupId);

  // 3. Добавить новые, удалить устаревшие — только те, у которых source=SSO_SYNC
  const toAdd = claimGroupIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !claimGroupIds.includes(id));

  await prisma.$transaction([
    prisma.userGroupMember.deleteMany({
      where: { userId, groupId: { in: toRemove }, source: 'SSO_SYNC' },
    }),
    prisma.userGroupMember.createMany({
      data: toAdd.map((groupId) => ({ userId, groupId, source: 'SSO_SYNC' })),
    }),
  ]);
}
```

**Важно:** поле `UserGroupMember.source` — новое (enum `DIRECT | SSO_SYNC`). Мы **не трогаем** manually-added membership'ы. Требуется миграция: добавить колонку со значением `DIRECT` по умолчанию.

### 5.4 Выключение локального логина

```typescript
// auth.service.ts — login() changes:
async function login(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) throw new Unauthorized('INVALID_CREDENTIALS');

  const hasActiveSso = await prisma.identityProvider.count({ where: { isEnabled: true } }) > 0;
  const isSuperAdmin = user.systemRoles.some((r) => r.role === 'SUPER_ADMIN');

  if (hasActiveSso && !isSuperAdmin) {
    throw new Forbidden('LOCAL_LOGIN_DISABLED_USE_SSO');
  }

  // ... rest of password validation
}
```

Фронт на ответ `LOCAL_LOGIN_DISABLED_USE_SSO` показывает сообщение «Используйте SSO для входа».

### 5.5 Админ-UI провайдеров

- Страница `/admin/sso/providers` — таблица всех IdP.
- Кнопка «Добавить» → форма:
  - name, iconUrl
  - issuer (URL) — при вводе можно делать discovery-test
  - clientId, clientSecret (masked after save)
  - scopes (tags-input)
  - claim mappings (emailClaim, nameClaim, groupClaim)
  - isEnabled, syncEnabled, syncInterval
- Кнопка «Test connection» — пробует discovery + показывает полученные endpoints.

### 5.6 Sync worker

- Cron процесс (можно in-process BullMQ job): каждую минуту проверяет все `IdentityProvider` с `syncEnabled=true && (now - lastSyncAt) > syncIntervalMin`.
- Для каждого: вызывает IdP Admin API (specific для каждого провайдера — Keycloak `/admin/realms/.../users`).
- Получает список active users, сравнивает с `UserIdentity`:
  - В IdP disabled, а в TT есть → `User.isActive=false`.
  - В IdP enabled, а в TT `isActive=false` и последний logon > 30 дней → не активируем (админ решает).

**Оговорка:** sync worker — **не-generic**. Разные IdP имеют разные Admin API. В MVP реализуем адаптер только для **Keycloak** (наиболее используем в on-prem). Для других провайдеров `syncEnabled=false` + ручное управление.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: CRUD IdentityProvider в `/admin/sso/providers`.
- [ ] FR-2: На логин-экране динамический список активных провайдеров.
- [ ] FR-3: OIDC auth flow работает end-to-end (local Keycloak + integration-тест).
- [ ] FR-4: JIT создаёт User с `USER` role + UserIdentity.
- [ ] FR-5: Существующий email → confirm-dialog с паролем → линкование.
- [ ] FR-6: Группы из claim мапятся по имени (case-insensitive).
- [ ] FR-7: Локальный логин выключен для всех, кроме SUPER_ADMIN, при наличии активного IdP.
- [ ] FR-8: Периодический sync (Keycloak-адаптер) деактивирует disabled-юзеров.
- [ ] FR-9: clientSecret шифруется AES-GCM.

### Нефункциональные
- [ ] NFR-1: OIDC callback + userinfo + DB-writes укладывается в < 2 сек p95.
- [ ] NFR-2: Sync worker не блокирует основной API — работает в отдельном процессе.
- [ ] NFR-3: Group-sync на юзера с 50 группами < 500ms.

### Безопасность
- [ ] SEC-1: State/nonce validated в OIDC callback.
- [ ] SEC-2: PKCE (S256) включён для всех OIDC-flows.
- [ ] SEC-3: clientSecret не возвращается в API.
- [ ] SEC-4: Session после SSO-login ≡ session после локального (sliding session из TTMP-171).
- [ ] SEC-5: Emergency CLI для сброса пароля SUPER_ADMIN (если оба SSO и пароль утеряны).
- [ ] SEC-6: Audit-log для: add/remove provider, link account, sync result, disable/enable user.

### Тестирование
- [ ] Unit: OIDC callback state-validation, group-sync diff logic, link-flow.
- [ ] Integration: local Keycloak → login → JIT → groups.
- [ ] Integration: link existing account.
- [ ] E2E: full auth flow через UI.
- [ ] Security: invalid state, replayed code, wrong redirect_uri.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: Admin добавляет Keycloak provider — появляется на login-экране.
- [ ] AC-2: Login через Keycloak создаёт нового User (JIT) + UserIdentity + USER role.
- [ ] AC-3: Повторный login — без JIT, UserIdentity найден.
- [ ] AC-4: Существующий email → confirm-dialog, вход с правильным паролем создаёт UserIdentity.
- [ ] AC-5: Группы из IdP синхронизированы на UserGroup (source=SSO_SYNC).
- [ ] AC-6: Локальный логин отклоняется для не-SUPER_ADMIN при включённом SSO.
- [ ] AC-7: SUPER_ADMIN логинится локально.
- [ ] AC-8: Sync worker деактивирует disabled-юзера Keycloak → через минуту User.isActive=false.
- [ ] AC-9: clientSecret encrypted в БД (проверка — `SELECT client_secret_enc` — не plain).
- [ ] AC-10: Тесты зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Дизайн (models, flows, state diagrams) | 6 |
| Prisma-миграции + encryption util | 4 |
| `openid-client` wrapper + redis-state store | 6 |
| SSO-router (login/callback/link) | 10 |
| JIT-provisioning + email-matching logic | 6 |
| Group-sync helper + `UserGroupMember.source` migration | 6 |
| Keycloak sync-worker adapter | 10 |
| Admin-UI: providers list + form + test-connection | 14 |
| Frontend: LoginPage list + callback + link pages | 10 |
| Emergency CLI script | 2 |
| Tests (unit + integration + security) | 16 |
| Docs (architecture/sso.md + runbook) | 4 |
| Code review + AI review | 8 |
| **Итого** | **102** (~2 спринта) |

---

## 9. Связанные задачи

- **Зависит от:** нет.
- **Блокирует:** частично TTMFA-1 (2FA применим только к non-SSO — нужен SUPER_ADMIN-only сценарий).
- **Связано:** TTSEC-2 (UserGroup — переиспользуем), TTMP-171 (session).

---

## 10. Иерархия задач

```
TTSSO-1 (EPIC) — SSO / OIDC
  ├─ TTSSO-1.1 — Prisma models + encryption utility
  ├─ TTSSO-1.2 — openid-client wrapper + Redis state
  ├─ TTSSO-1.3 — /sso/login + /sso/callback + /sso/link
  ├─ TTSSO-1.4 — JIT + email-linking + group-sync
  ├─ TTSSO-1.5 — Admin-UI (providers CRUD + test)
  ├─ TTSSO-1.6 — Keycloak sync-worker
  ├─ TTSSO-1.7 — Frontend LoginPage / CallbackPage / LinkPage
  └─ TTSSO-1.8 — Tests + security review + docs
```
