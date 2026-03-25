# ADR-001: Technology Stack Selection

**Date:** 2026-03-09
**Status:** Accepted
**Deciders:** Pavel Novak (PO), Claude Code (AI architect)

---

## Context

Flow Universe is a Jira replacement for the Russian financial sector, targeting 50–5000 users on-premise (Astra Linux SE 1.7+, Red OS 7.3+). The existing prototype was a ~4000-line vanilla JS monolith. A full rebuild was chosen over incremental migration.

Key constraints:
- Must comply with ФЗ-152 (personal data)
- Must run on Russian-certified Linux distros
- AI agent (Claude/Cursor) acts as primary developer; PO as validator
- Competitive alternatives: Т1 Сфера, EVA, Diasoft

---

## Decision

### Language: TypeScript 5.x

**Alternatives considered:** JavaScript (ES2022)

**Rationale:** TypeScript was not in the original ТЗ (which specified JS), but was recommended and accepted by PO. Benefits: compile-time safety for domain model (complex Issue hierarchy, RBAC), better tooling for AI-assisted development, industry standard for new Node.js projects.

---

### Frontend: React 18 + Vite 6 + Ant Design 5

**Alternatives considered:** Vue 3 + Element Plus, plain HTML

**Rationale:**
- React 18 — same stack as Atlassian (Jira), familiarity for future devs
- Vite 6 — fast HMR, ESM-native, good TypeScript support
- Ant Design 5 — enterprise component library with dark theme, table with resize columns, form validation, date pickers — reduces custom UI work significantly
- PO confirmed: "suitable for Jira Cut ТЗ and based on world vendors (Atlassian)"

**State management:** Zustand (lightweight, no boilerplate, good TypeScript inference)

---

### Backend: Node.js 20 LTS + Express 4

**Alternatives considered:** FastAPI (Python), NestJS

**Rationale:**
- Same language as frontend (TypeScript) — reduces context switching
- Express 4 — minimal, well-understood, easy to structure as modular monolith
- Node.js 20 LTS — FIPS-compatible builds available, supported on Astra Linux

---

### ORM: Prisma 6

**Alternatives considered:** TypeORM, raw SQL (pg)

**Rationale:** Prisma chosen by PO from recommendation. Type-safe query builder, auto-generated migrations, excellent TypeScript integration, Prisma Studio for DB inspection. The declarative schema file (`schema.prisma`) serves as single source of truth for the data model.

---

### Database: PostgreSQL 16 + Redis 7

**PostgreSQL:** Required by ТЗ. Target: 16 on Linux (14+ supported). FIPS-compatible. On-premise friendly.

**Redis:** Added for session store, rate limiting, background job queue. Docker Compose for local dev; production runs as separate container.

---

### Auth: JWT + refresh tokens

**Alternatives considered:** Session cookies (stateful), Passport.js

**Rationale:** Stateless JWT enables horizontal scaling. Refresh tokens (stored in DB `RefreshToken` table) provide revocation capability. Future integration path: KeyCloak / ALD Pro SSO via OAuth2 OIDC without replacing the auth layer.

**Future:** KeyCloak / ALD Pro SSO (Sprint 5+), SIEM integration via audit log export.

---

### Testing: Vitest + Supertest

**Rationale:** Vitest is Jest-compatible but ESM-native, runs in the same TypeScript environment. Supertest for HTTP integration tests. Target: 60%+ coverage for MVP (80%+ long-term).

---

### CI/CD: GitHub Actions

4 workflows: `ci.yml` (lint + test), `build-and-publish.yml` (Docker image), `deploy-staging.yml` (auto), `deploy-production.yml` (manual approval).

---

## Consequences

**Positive:**
- Strong type safety across entire stack (Prisma schema → TS types → API → React)
- Ant Design covers 90% of enterprise UI needs out of the box
- Single language for frontend and backend reduces onboarding cost

**Negative:**
- Node.js runtime not in the Russian software registry (Реестр ПО РФ) — mitigated by deploying as Docker container on certified OS
- Prisma generates large client bundles — acceptable for server-side, not a concern
- Ant Design v5 has breaking changes from v4 — locked to v5, no major upgrades planned for MVP lifecycle

**Risks:**
- Astra Linux SE package manager (apt) may not have Node.js 20 — solved by Docker deployment
- Redis requires persistent volume in production — covered in `docs/guides/operations.md`

---

## References

- `CLAUDE.md` — full interview Q&A (8 blocks) that led to these decisions
- `docs/architecture/overview.md` — current system architecture
- `docs/guides/getting-started.md` — stack setup instructions
