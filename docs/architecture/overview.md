# Flow Universe — System Architecture Overview

> **Audience:** Developers, DevOps, Technical Leads
> **Last updated:** 2026-03-25
> **Language:** English (primary for architecture docs)

---

## What is Flow Universe?

Flow Universe is a Jira-replacement project management system for the Russian financial sector. It targets teams of 50–5,000 users, runs on-premise (Astra Linux SE 1.7+, Red OS 7.3+), and complies with ФЗ-152 (Russian personal data law).

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Browser Client                             │
│         React 18 + Vite 6 + Ant Design 5 + Zustand             │
│         http://localhost:5173 (dev) | https://app (prod)        │
└───────────────────────────┬────────────────────────────────────┘
                            │ HTTPS / JWT Bearer
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                  Nginx (reverse proxy)                          │
│     • TLS termination   • Rate limiting (auth 5r/s, api 30r/s) │
│     • Security headers  • client_max_body_size 10m             │
└───────────────────────────┬────────────────────────────────────┘
                            │ HTTP (internal)
                            ▼
┌────────────────────────────────────────────────────────────────┐
│           Node.js 20 LTS — Express 4 (backend/)                 │
│                                                                  │
│  Middleware chain:                                               │
│  helmet → cors → express.json → cookieParser                    │
│                                                                  │
│  Modules (each: router → service → Prisma):                     │
│  auth · users · projects · issues · boards · sprints            │
│  releases · comments · time · teams · admin · ai · webhooks     │
│                                                                  │
│  Shared: auth middleware · RBAC · audit · validation · errors   │
└──────────────┬──────────────────────────┬──────────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐    ┌─────────────────────────┐
│   PostgreSQL 16       │    │        Redis 7           │
│  (Prisma 6 ORM)       │    │  (cache, rate limiting,  │
│  14 tables + enums    │    │   session support)       │
└──────────────────────┘    └─────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Frontend framework | React | 18.3 |
| Frontend build | Vite | 6.x |
| UI component library | Ant Design | 5.x |
| State management | Zustand | 5.x |
| Drag & drop | @hello-pangea/dnd | 18.x |
| Backend framework | Express | 4.x |
| Runtime | Node.js | 20 LTS |
| ORM | Prisma | 6.x |
| Validation | Zod | 3.x |
| Database | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Authentication | JWT + refresh tokens | — |
| Password hashing | bcryptjs | — |
| Unit/Integration tests | Vitest + Supertest | 3.x / 7.x |
| E2E tests | Playwright | 1.50 |
| Component catalog | Storybook | 10.x |
| HTTP security | helmet, cors | — |
| Linting | ESLint + Prettier | — |
| CI/CD | GitHub Actions | — |
| Container | Docker Compose | — |
| AI integration | Anthropic Claude API | @anthropic-ai/sdk 0.39 |

---

## Project Structure

```
tasktime-mvp/
├── backend/              # Node.js API server
│   └── src/
│       ├── modules/      # Feature modules (15+)
│       ├── prisma/       # Schema, seed, migrations
│       ├── shared/       # Middleware, auth, utils, types
│       ├── app.ts        # Express app factory
│       └── server.ts     # Entry point (port binding)
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # 15 main pages + admin sub-pages
│       ├── components/   # Reusable UI components
│       ├── api/          # Axios-based API client modules
│       ├── store/        # Zustand stores
│       └── App.tsx       # Router configuration
├── docs/                 # This documentation
├── deploy/               # Deployment scripts, nginx, env templates
├── .github/workflows/    # CI/CD (ci, build, deploy-staging, deploy-production, update-docs)
├── docker-compose.yml    # Local dev: PostgreSQL + Redis
└── Makefile              # Developer shortcuts
```

---

## Modular Architecture

The backend follows a **modular monolith** pattern. Each module is completely self-contained:

```
modules/<name>/
├── <name>.router.ts   # HTTP routes + middleware wiring
├── <name>.service.ts  # Business logic
└── <name>.dto.ts      # Zod validation schemas (request bodies)
```

**Rules:**
- Modules **never** import each other's services directly
- Cross-module data access goes through Prisma (shared DB layer)
- All routes require `authenticate` middleware (JWT check)
- Protected operations additionally require `requireRole(...)` middleware

---

## Request Lifecycle

```
HTTP Request
    ↓
Nginx (rate-limit, TLS)
    ↓
Express (helmet, cors, json)
    ↓
authenticate middleware   ← validates JWT, attaches req.user
    ↓
requireRole middleware    ← checks RBAC (if route needs it)
    ↓
validate middleware       ← Zod schema check (if route has body)
    ↓
Route handler             ← calls service
    ↓
Service (business logic)  ← calls Prisma
    ↓
logAudit middleware       ← writes to audit_logs (for mutations)
    ↓
Response
    ↓
errorHandler (global)     ← catches any thrown error, formats response
```

---

## Non-Functional Requirements (NFR)

| Metric | Target |
|--------|--------|
| API response time (p95) | < 200ms |
| Page load | < 2s |
| Concurrent sessions | 2,500+ |
| Database objects | 1M+ |
| Test coverage | 60%+ |
| Browser support | Chrome 139+, Yandex Browser 25+, Edge 139+, Safari 18+ |

---

## Deployment Environments

| Environment | Branch | Trigger |
|-------------|--------|---------|
| Local dev | any | `make dev` |
| Staging | `main` | Auto on merge |
| Production | `main` | Manual approval |

Target OS: **Astra Linux SE 1.7+**, **Red OS 7.3+**, Ubuntu 22.04 LTS (dev/staging).

---

## Security Overview

See [security.md](./security.md) for full details.

- JWT access tokens (short-lived) + refresh tokens (stored in DB)
- bcryptjs password hashing
- RBAC: SUPER_ADMIN → ADMIN → MANAGER → USER → VIEWER
- Full audit log on all mutations (ФЗ-152 compliance)
- Helmet security headers, CORS, rate limiting via Nginx

---

## Related Docs

- [data-model.md](./data-model.md) — Database schema (all models)
- [backend-modules.md](./backend-modules.md) — All 14 modules in detail
- [frontend-architecture.md](./frontend-architecture.md) — Pages, routing, state
- [security.md](./security.md) — RBAC, JWT flow, audit
- [../api/reference.md](../api/reference.md) — Full API reference
- [../guides/getting-started.md](../guides/getting-started.md) — Local setup

<!-- AUTO-GENERATED:START:features -->
> ⚡ Авто-сгенерировано из `backend/src/shared/features.ts`
> Управление через переменные окружения в `.env`.

| Флаг | Env-переменная | По умолчанию | Описание |
|------|---------------|-------------|----------|
| `ai` | `FEATURES_AI` | `true` | AI-оценка задач и декомпозиция |
| `mcp` | `FEATURES_MCP` | `true` | MCP-прокси для Claude Desktop |
| `gitlab` | `FEATURES_GITLAB` | `true` | GitLab webhook интеграция |
| `telegram` | `FEATURES_TELEGRAM` | `false` | Telegram-бот уведомления |
| `aiProvider` | `AI_PROVIDER` | `heuristic` | AI провайдер: `anthropic` или `heuristic` |
<!-- AUTO-GENERATED:END:features -->
