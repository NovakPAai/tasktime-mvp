# ТЗ: TTMFA-1 — Two-Factor Authentication (TOTP)

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P2 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Двухфакторная аутентификация через **TOTP** (Google Authenticator, Authy, 1Password) для пользователей с локальным паролем. SSO-юзеры MFA делают на стороне IdP, поэтому TTMFA-1 дополняет TTSSO-1, а не конкурирует.

Ключевые особенности:
- **TOTP only** (RFC 6238, 30-сек окно, 6 цифр).
- **Обязательность настраивается** per-role через SystemSetting (default: обязательно для `SUPER_ADMIN`).
- **10 recovery codes** при enrollment + admin-reset как fallback.
- **Re-auth** для чувствительных операций (смена пароля/email, отключение MFA).
- **Trust device** опционально, включается через Password Policy.

### Пользовательские сценарии

**SUPER_ADMIN enrollment:**
1. После login'а — редирект на `/mfa/enroll` (forced).
2. Показывается QR + secret (copy).
3. Сканирует Google Authenticator → вводит первый код.
4. Получает 10 recovery codes → «Сохраните, не показываются повторно».
5. Подтверждает копирование → MFA включён.

**Обычный логин:**
1. Email + пароль.
2. Если MFA включён → экран «Введите код».
3. Вводит 6 цифр → успех.

**Потерял телефон:**
1. На логин-экране «Не можете войти?» → форма с recovery code.
2. Ввёл код → доступ + disable существующего TOTP.
3. Или: обращается к SUPER_ADMIN, который делает `POST /admin/users/:id/mfa/reset`.

---

## 2. Текущее состояние

- MFA отсутствует полностью.
- `User.passwordHash` уже есть.
- Password Policy (TTSEC-4) содержит флаг `mfaTrustDevice` — интегрируемся.

---

## 3. Зависимости

### Модули backend
- [ ] `modules/mfa/mfa.service.ts` — enroll, verify, recovery-codes, reset.
- [ ] `modules/mfa/mfa.router.ts` — endpoints.
- [ ] `modules/auth/auth.service.ts` — интегрировать MFA-check в login-flow.
- [ ] `modules/auth/reauth.service.ts` (новый) — для sensitive-ops (re-auth flow).

### Frontend
- [ ] `pages/MfaEnrollPage.tsx`.
- [ ] `pages/MfaVerifyPage.tsx`.
- [ ] `pages/MfaRecoveryPage.tsx`.
- [ ] `pages/SettingsPage.tsx` — добавить раздел «MFA» с disable-кнопкой.
- [ ] `components/admin/MfaResetButton.tsx` — для admin user page.
- [ ] `components/auth/ReauthDialog.tsx` — модалка для re-auth.

### Модели данных (Prisma)
- [ ] `UserMfa` — новая.
- [ ] `UserMfaRecoveryCode` — новая.
- [ ] `UserMfaTrustedDevice` (опционально, если trust-device включён).
- [ ] `SystemSetting` ключ: `mfa.required_roles` — array of SystemRoleType.

### Внешние зависимости
- [ ] `otplib` — TOTP генерация/валидация.
- [ ] `qrcode` — для QR-generation.
- [ ] `argon2` — для recovery-code hashing (уже может быть в deps, либо bcrypt).

### Блокеры
- **TTSEC-4 желателен** (переиспользуем re-auth pattern). Без TTSEC-4 работает, но `mfaTrustDevice` настраивается отдельно.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Time-drift между server и authenticator → valid OTP отклоняется | Средняя | UX | Default window=1 (допускает ±30сек drift); в высоконагруженных случаях — window=2 |
| 2 | Secret leak через логи | Средняя | Compromise | Secret encrypted at rest (AES-GCM с master-key из ENV); никогда не логируется |
| 3 | Recovery codes показаны один раз, пользователь не сохранил | Высокая | Lockout | Admin-reset как second line; clear warning на enrollment |
| 4 | SUPER_ADMIN все потеряли MFA — backdoor? | Низкая | Lockout всей системы | Emergency CLI: `npm run admin:mfa:reset -- --email=...` (подписано SUPER_ADMIN_EMERGENCY_KEY) |
| 5 | Brute-force TOTP (1M попыток за 30 сек → шанс 0.01%) | Низкая | Compromise | Rate-limit 5 attempts per 5 min per-user (Redis); после 5 fails — auto-lockout + alert |
| 6 | Trust-device cookie захвачен | Средняя | Compromise | HTTP-only, Secure, SameSite=Strict; TTL 30 дней max; fingerprint = hash(user-agent + ip /24) |

---

## 5. Особенности реализации

### 5.1 Модели

```prisma
enum MfaMethod {
  TOTP
  // WEBAUTHN — фазово
}

model UserMfa {
  id          String    @id @default(uuid())
  userId      String    @unique @map("user_id")
  method      MfaMethod @default(TOTP)
  secretEnc   String    @map("secret_enc")  // AES-GCM encrypted
  isConfirmed Boolean   @default(false) @map("is_confirmed")
  enrolledAt  DateTime? @map("enrolled_at")
  lastUsedAt  DateTime? @map("last_used_at")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user             User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  recoveryCodes    UserMfaRecoveryCode[]
  trustedDevices   UserMfaTrustedDevice[]

  @@map("user_mfa")
}

model UserMfaRecoveryCode {
  id         String    @id @default(uuid())
  mfaId      String    @map("mfa_id")
  codeHash   String    @map("code_hash")  // argon2 hash
  usedAt     DateTime? @map("used_at")
  createdAt  DateTime  @default(now())

  mfa        UserMfa   @relation(fields: [mfaId], references: [id], onDelete: Cascade)

  @@index([mfaId])
  @@map("user_mfa_recovery_codes")
}

model UserMfaTrustedDevice {
  id              String   @id @default(uuid())
  mfaId           String   @map("mfa_id")
  fingerprint     String   // hash(UA + IP /24)
  deviceName      String?  @map("device_name")  // "Chrome on MacBook"
  expiresAt       DateTime @map("expires_at")
  createdAt       DateTime @default(now())

  mfa             UserMfa  @relation(fields: [mfaId], references: [id], onDelete: Cascade)

  @@unique([mfaId, fingerprint])
  @@map("user_mfa_trusted_devices")
}
```

### 5.2 Login-flow расширение

```
POST /auth/login { email, password }
  → 200 { requiresMfa: true, mfaSessionToken: "jwt-short" }   // если user имеет UserMfa и isConfirmed=true
  → 200 { accessToken, refreshToken, user }                   // если MFA не требуется

POST /auth/mfa/verify { mfaSessionToken, code }
  → 200 { accessToken, refreshToken, user }
  → 401 { error: 'INVALID_CODE', attemptsLeft: 4 }

POST /auth/mfa/recovery { mfaSessionToken, recoveryCode }
  → 200 { accessToken, refreshToken, user, mfaDisabled: true }  // recovery сбрасывает MFA
```

`mfaSessionToken` — короткоживущий JWT (TTL 5 мин), содержит `{ userId, step: 'mfa' }`.

### 5.3 Enrollment

```
GET /api/mfa/enroll
  → { qrDataUrl: "data:image/png;base64,...", secret: "base32" }
  // secret хранится в Redis по userId на 10 мин; в БД не пишется до confirm

POST /api/mfa/confirm { code }
  → валидирует code против Redis-secret
  → сохраняет UserMfa(userId, secretEnc, isConfirmed=true)
  → генерирует 10 recovery codes (hashed в UserMfaRecoveryCode)
  → возвращает { recoveryCodes: ['aaaa-bbbb', ...] }
  // ПОКАЗАНО ОДИН РАЗ, дальше админ-сброс

DELETE /api/mfa  (require re-auth)
  → удаляет UserMfa cascade (recovery + trusted devices)
```

### 5.4 Required roles — enforcement

```typescript
// modules/mfa/mfa-enforcement.ts
export async function ensureMfaCompliance(user: UserWithRoles): Promise<void> {
  const required = await getSystemSetting('mfa.required_roles') as SystemRoleType[];
  const hasRequiredRole = user.systemRoles.some((r) => required.includes(r));
  if (!hasRequiredRole) return;

  const mfa = await prisma.userMfa.findUnique({ where: { userId: user.id } });
  if (!mfa || !mfa.isConfirmed) {
    // Forced enrollment на фронте
    throw new MfaEnrollmentRequiredError();
  }
}
```

Default: `mfa.required_roles = ['SUPER_ADMIN']`.

### 5.5 Re-auth для sensitive operations

```typescript
// shared/reauth.ts
// Sensitive: change-password, change-email, disable-mfa, create-api-token

// GET /auth/reauth/challenge  — возвращает тип challenge
//   → { requiresPassword: true, requiresMfa: true }

// POST /auth/reauth { password, mfaCode }
//   → 200 { reauthToken: "jwt-ttl-5min" }

// Все sensitive endpoints требуют header X-Reauth-Token: <token>
// backend проверяет: JWT valid, userId matches, < 5 мин
```

Frontend показывает `ReauthDialog` при вызове sensitive операции.

### 5.6 Recovery codes

```typescript
function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const part1 = crypto.randomBytes(2).toString('hex');
    const part2 = crypto.randomBytes(2).toString('hex');
    return `${part1}-${part2}`;
  });
}

// При verify recovery code:
// - find code by hash match among unused codes of user's MFA
// - mark used_at
// - если это recovery flow: disable MFA, отправить email «MFA disabled»
```

### 5.7 Trusted Device

Если Password Policy.mfaTrustDevice = true:
- При verify успехе — checkbox «Не спрашивать 30 дней».
- Если отмечен: генерируется device fingerprint hash (UA + IP/24), создаётся `UserMfaTrustedDevice`.
- Cookie `tt_mfa_trust` (HTTP-only, Secure, SameSite=Strict, TTL 30 дней) = JWT с `{ userId, fingerprint, exp }`.
- При следующем логине — если cookie валиден и fingerprint совпадает → skip MFA step.

### 5.8 Admin reset

```
POST /admin/users/:id/mfa/reset  (SUPER_ADMIN only, requires re-auth)
  → удаляет UserMfa cascade
  → audit-log
  → уведомление юзера (email через TTNOTIF-1)
```

### 5.9 Rate limiting

Redis ключи:
- `mfa:attempts:{userId}` — счётчик failed attempts, TTL 5 мин.
- После 5 fails → `mfa:lockout:{userId}` TTL 30 мин → все verify возвращают 429.

### 5.10 Emergency CLI

```bash
# backend/scripts/admin-mfa-reset.ts
# Usage: npm run admin:mfa:reset -- --email=foo@bar.com --emergencyKey=$SUPER_ADMIN_EMERGENCY_KEY

# Проверяет ENV SUPER_ADMIN_EMERGENCY_KEY, находит user, удаляет UserMfa, логирует.
```

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: `/api/mfa/enroll` → QR + secret в Redis.
- [ ] FR-2: `/api/mfa/confirm` → сохраняет, генерирует 10 recovery codes.
- [ ] FR-3: Login-flow с MFA: requiresMfa → verify.
- [ ] FR-4: Recovery-flow работает, сбрасывает MFA.
- [ ] FR-5: Admin-reset + audit + email-notify.
- [ ] FR-6: Forced enrollment для required roles (default SUPER_ADMIN).
- [ ] FR-7: Re-auth для sensitive operations.
- [ ] FR-8: Trust-device через Password Policy.
- [ ] FR-9: Rate-limit 5 per 5 min.
- [ ] FR-10: Emergency CLI.

### Нефункциональные
- [ ] NFR-1: TOTP-validate < 10ms.
- [ ] NFR-2: Enrollment-QR < 200ms.

### Безопасность
- [ ] SEC-1: Secret encrypted at rest.
- [ ] SEC-2: Recovery codes hashed (argon2id).
- [ ] SEC-3: mfaSessionToken — JWT с short TTL и `step=mfa` claim.
- [ ] SEC-4: Re-auth token — short TTL, одноразовый nonce.
- [ ] SEC-5: Trust-device cookie — HTTP-only, Secure, SameSite=Strict.
- [ ] SEC-6: Audit для: enroll, disable, reset, trust-device add/remove.

### Тестирование
- [ ] Unit: otp validation (window ±1), rate-limit, recovery-code hash.
- [ ] Integration: full login with MFA.
- [ ] Integration: recovery flow sets MFA disabled.
- [ ] Integration: required role → forced enrollment.
- [ ] Integration: re-auth gate на sensitive ops.
- [ ] Security: brute-force отсекается.
- [ ] Покрытие ≥ 75% (security-critical).

---

## 7. Критерии приёмки

- [ ] AC-1: Enrollment → Google Authenticator принимает TOTP.
- [ ] AC-2: Login с правильным кодом — success.
- [ ] AC-3: 5 неправильных → 429 lockout 30 мин.
- [ ] AC-4: Recovery code сбрасывает MFA.
- [ ] AC-5: Admin-reset работает.
- [ ] AC-6: SUPER_ADMIN не может логиниться без MFA, пока не enrolled.
- [ ] AC-7: Re-auth требуется для change-password / disable-mfa.
- [ ] AC-8: Trust-device cookie skip'ает verify.
- [ ] AC-9: Emergency CLI сбрасывает MFA.
- [ ] AC-10: Tests + security review.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma models + encryption | 4 |
| otplib integration + enroll/verify endpoints | 6 |
| Recovery codes + admin reset | 4 |
| Login-flow integration | 4 |
| Re-auth service + dialog | 6 |
| Required-roles enforcement | 3 |
| Trust-device (cookie + fingerprint) | 4 |
| Rate-limit Redis | 2 |
| Emergency CLI | 2 |
| Frontend: Enroll/Verify/Recovery pages | 10 |
| Frontend: Settings MFA section | 3 |
| Admin MFA reset button | 2 |
| Tests (unit + integration + security) | 12 |
| Docs | 2 |
| Code review | 4 |
| **Итого** | **68** (~1 спринт) |

---

## 9. Связанные задачи

- **Зависит от:** TTSEC-4 (re-auth integration желателен).
- **Связано:** TTSSO-1 (MFA не применяется к SSO-юзерам).

---

## 10. Иерархия задач

```
TTMFA-1 (TASK) — 2FA / TOTP
  ├─ TTMFA-1.1 — Prisma models + encryption
  ├─ TTMFA-1.2 — otplib integration + enroll/verify
  ├─ TTMFA-1.3 — Recovery codes + admin reset
  ├─ TTMFA-1.4 — Login-flow integration
  ├─ TTMFA-1.5 — Re-auth service
  ├─ TTMFA-1.6 — Trust-device (optional)
  ├─ TTMFA-1.7 — Emergency CLI
  ├─ TTMFA-1.8 — Frontend pages
  └─ TTMFA-1.9 — Tests + review
```
