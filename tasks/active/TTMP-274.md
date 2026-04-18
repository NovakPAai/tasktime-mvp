---
id: TTMP-274
source: flow-universe
issue_key: TTMP-274
author: "@jackrescuer-gif"
priority: P0
deadline: null
classification:
  type: refactor
  complexity: L
  risk: medium
  pipeline: "planner → impl → verify → code-review"
  gate_passed: true
  confidence: 0.95
  classified_at: "2026-04-18T09:00:00Z"
---

# TTMP-274 — Рефакторинг CI/CD WF

## Intent
Аудит и рефакторинг GitHub Actions: убрать оверхед, устранить security-баги, добавить gate перед деплоем.

## Acceptance Criteria
- [ ] CI время на PR: ≤6 мин (было ~8-10 мин)
- [ ] build-publish не стартует без approved review (человек или AI-APPROVED бот)
- [ ] AI-агент может APPROVE/REQUEST_CHANGES PR (не только комментировать)
- [ ] E2E в отдельном workflow с прогретым Playwright-кэшем
- [ ] Токены не через `echo` в ssh-командах
- [ ] Manual dispatch и rollback работают

## Фазы (7 PR'ов)

| PR | Scope | Риск | Статус |
|----|-------|------|--------|
| PR-1 | ci.yml: paths-ignore + timeout + docker buildx cache, убрать publish/deploy/e2e | low | ✅ DONE |
| PR-2 | e2e-staging.yml: отдельный workflow + Playwright cache | low | ⏳ TODO |
| PR-3 | build-and-publish.yml: pipeline-service image + approval gate | medium | ⏳ TODO |
| PR-4 | deploy-staging.yml: fix token leak + atomic env update | medium | ⏳ TODO |
| PR-5 | ai-review.yml: APPROVE/REQUEST_CHANGES + paths-ignore + @v6 | low | ⏳ TODO |
| PR-6 | Косметика: CODEOWNERS, unified versions, deploy-production timeout | low | ⏳ TODO |
| Settings | Branch protection: добавить AI Review в required checks | — | ⏳ AFTER PR-5 |

## Ключевые проблемы (аудит)

| Проблема | Файл | Риск |
|----------|------|------|
| publish + deploy-staging + e2e встроены в ci.yml | ci.yml | гонки, оверхед |
| docker build --no-cache без GHA cache | ci.yml:117-119 | ~5-8 мин потери |
| Playwright browsers не кэшируются | ci.yml:302 | ~2 мин потери |
| Нет paths-ignore — CI гоняется на docs/md | все workflows | полный прогон зря |
| Нет timeout-minutes | все jobs | зависания |
| `echo '$GHCR_TOKEN'` в ssh → попадает в args | deploy-staging.yml:45 | security |
| sed -i на remote env → race condition | deploy-staging.yml:49-54 | reliability |
| AI-review только комментирует, не блокирует | ai-review.yml | нет gate |
| @v4 на checkout/setup-node в ai-review | ai-review.yml | deprecated |
| pipeline-service не собирается в build-publish | build-and-publish.yml | неполный деплой |

## Целевая архитектура

```
feature branch
  → ci.yml (lint + typecheck + test + docker buildx)   ← блокирует merge
  → ai-review.yml → APPROVE или REQUEST_CHANGES        ← блокирует merge

PR approved → merge в main
  → build-publish.yml  [gate: проверяет approval]
      ↓ success
  → deploy-staging.yml [workflow_run trigger]
      ↓ success
  → e2e-staging.yml    [workflow_run trigger]
      ↓
  [manual] deploy-production.yml
```
