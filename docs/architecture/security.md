# Flow Universe — Security Architecture

> **Audience:** Developers, Security Engineers, DevOps
> **Compliance:** ФЗ-152 (Russian personal data law)
> **Last updated:** 2026-03-25

---

## Authentication

### JWT Flow

```
1. POST /api/auth/login  →  { token, refreshToken }
2. Client stores:
   - token (access JWT, short-lived: JWT_EXPIRES_IN env, default 7d)
   - refreshToken (stored in DB: refresh_tokens table)
3. Every request: Authorization: Bearer <token>
4. Token expiry → POST /api/auth/refresh → new token + refreshToken
5. Logout → POST /api/auth/logout → refreshToken deleted from DB
```

### Token Implementation

- Access token: signed with `JWT_SECRET` env variable (HMAC-SHA256)
- Refresh token: stored in `refresh_tokens` table with `expires_at`
- Password hashing: `bcryptjs` (salt rounds: 10)
- Token payload: `{ userId, role, iat, exp }`

### Middleware: `authenticate`

File: `backend/src/shared/middleware/auth.ts`

1. Reads `Authorization: Bearer <token>` header
2. Verifies signature with `JWT_SECRET`
3. Checks token not expired
4. Attaches `req.user = { userId, role }` to request
5. Returns 401 if missing or invalid

---

## Authorization (RBAC)

### Role Hierarchy

```
SUPER_ADMIN
    └── ADMIN
           └── MANAGER
                  └── USER
                         └── VIEWER
```

SUPER_ADMIN bypasses all role checks (see `roles.ts`).

### Role Capabilities

| Capability | VIEWER | USER | MANAGER | ADMIN | SUPER_ADMIN |
|-----------|--------|------|---------|-------|-------------|
| View projects & issues | ✓ | ✓ | ✓ | ✓ | ✓ |
| View reports & stats | ✓ | — | ✓ | ✓ | ✓ |
| View audit log | ✓ | — | ✓ | ✓ | ✓ |
| Create/edit own issues | — | ✓ | ✓ | ✓ | ✓ |
| Create/edit any issue | — | — | ✓ | ✓ | ✓ |
| Assign issues | — | — | ✓ | ✓ | ✓ |
| Create/manage projects | — | — | ✓ | ✓ | ✓ |
| Create/manage sprints | — | — | ✓ | ✓ | ✓ |
| Manage teams | — | — | ✓ | ✓ | ✓ |
| Delete issues | — | — | — | ✓ | ✓ |
| Manage users | — | — | — | ✓ | ✓ |
| Assign ADMIN role | — | — | — | — | ✓ |

### Middleware: `requireRole`

File: `backend/src/shared/middleware/rbac.ts`

```typescript
requireRole('ADMIN', 'MANAGER')
// → returns 403 if req.user.role not in ['ADMIN', 'MANAGER', 'SUPER_ADMIN']
```

SUPER_ADMIN always passes, regardless of which roles are listed.

---

## Audit Logging (ФЗ-152)

All mutations are logged to `audit_logs` table:

```typescript
logAudit(req, 'issue.created', 'issue', issue.id, { type, title })
```

**Logged fields:**
- `action` — e.g. `issue.created`, `issue.status_changed`, `user.blocked`
- `entity_type` — e.g. `issue`, `project`, `user`
- `entity_id` — UUID of the affected entity
- `user_id` — who performed the action
- `details` — JSON diff of what changed
- `ip_address` — client IP
- `user_agent` — browser/client identifier
- `created_at` — timestamp

**Events logged:**
- `issue.created`, `issue.updated`, `issue.deleted`
- `issue.status_changed`, `issue.assigned`
- `issue.ai_flags_updated`, `issue.ai_status_updated`
- `issues.bulk_updated`
- `user.*` — user management operations

---

## HTTP Security

### Nginx (production)

- TLS 1.2+ (TLS 1.3 preferred)
- Rate limiting: `/api/auth/*` → 5 req/s, `/api/*` → 30 req/s
- Security headers:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: geolocation=(), microphone=()`
- `client_max_body_size 10m`

### Express (Helmet)

Applied globally via `helmet()`:
- `Content-Security-Policy`
- `X-DNS-Prefetch-Control`
- `X-XSS-Protection`
- `Strict-Transport-Security`

### CORS

Restricted to `CORS_ORIGIN` env variable (default: `http://localhost:5173`).
`credentials: true` to allow cookie/auth header passing.

---

## Secret Management

All secrets in environment variables — **never** in source code.

Required secrets:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | Token TTL e.g. `7d`, `1h` |
| `REDIS_URL` | Redis connection URL |
| `ANTHROPIC_API_KEY` | Claude API key (AI module) |
| `GITLAB_WEBHOOK_SECRET` | Webhook signature validation |

See `deploy/env/.env.example` for full list.

---

## Pre-commit Security Checklist

Before any commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated via Zod DTOs
- [ ] SQL injection not possible (Prisma parameterized queries only)
- [ ] XSS prevention (React escapes by default; no dangerouslySetInnerHTML)
- [ ] Authentication check on every protected route
- [ ] Audit log on every mutation
- [ ] Error messages don't expose internal details

---

## Compliance: ФЗ-152

Requirements and implementation:

| Requirement | Implementation |
|------------|---------------|
| Personal data access logging | `audit_logs` table — all reads/writes |
| User access control | RBAC with 5 roles |
| Data deletion capability | `DELETE /api/users/:id` (ADMIN only) |
| Audit trail | `audit_logs` with IP, user-agent, timestamp |
| HTTPS | Nginx TLS termination |
| Password protection | bcryptjs hashing, no plain text storage |

---

## Future Security Roadmap

- KeyCloak / ALD Pro SSO integration
- SIEM integration (log export)
- DLP integration
- MFA (TOTP/FIDO2)
- Field-level encryption for sensitive data
