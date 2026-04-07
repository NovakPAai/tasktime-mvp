#!/usr/bin/env bash
# doc-reminder.sh — Called by Claude Code PostToolUse hook (Edit|Write)
#
# Two-tier doc maintenance:
#   AUTO:      CHANGELOG append, pending-updates queue, generate-docs for API/schema
#   REMINDER:  stdout messages for docs that need human/Claude context to update

FILE="$1"
[ -z "$FILE" ] && exit 0
FILE="${FILE#./}"

# Resolve the repo that actually contains FILE (correct in multi-worktree scenarios)
MAIN_REPO=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null)
[ -z "$MAIN_REPO" ] && MAIN_REPO=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$MAIN_REPO" ] && exit 0

# Strip absolute path prefix so FILE is always repo-relative
FILE="${FILE#$MAIN_REPO/}"

QUEUE_FILE="$MAIN_REPO/.claude/pending-doc-updates.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# ── helpers ──────────────────────────────────────────────────────────────────

queue_append() {
  local doc="$1"
  local reason="$2"
  mkdir -p "$(dirname "$QUEUE_FILE")"
  echo "- \`$TIMESTAMP\` — \`$FILE\` → **$doc** ($reason)" >> "$QUEUE_FILE"
}

remind() {
  local header="$1"; shift
  echo ""
  echo "📋 $header"
  for msg in "$@"; do echo "   → $msg"; done
}

# ── AUTO: CHANGELOG append for any source file change ────────────────────────

if echo "$FILE" | grep -qE '\.(ts|tsx|js|jsx|prisma|yml|yaml|sh)$' && \
   ! echo "$FILE" | grep -qE '(node_modules|\.gen\.|\.d\.ts|dist/|build/)'; then

  CHANGELOG="$MAIN_REPO/docs/CHANGELOG-CLAUDE-$(date '+%Y-%m').md"
  mkdir -p "$(dirname "$CHANGELOG")"
  TODAY=$(date '+%Y-%m-%d')
  if ! grep -q "^## $TODAY" "$CHANGELOG" 2>/dev/null; then
    echo "" >> "$CHANGELOG"
    echo "## $TODAY" >> "$CHANGELOG"
  fi
  echo "- \`$FILE\`" >> "$CHANGELOG"
fi

# ── AUTO: generate-docs for API/schema/routing files ─────────────────────────

if echo "$FILE" | grep -qE 'backend/src/modules/.*\.router\.ts$'; then
  echo ""
  echo "✅ Авто: маршруты изменились → запускаю generate-docs --routes"
  (cd "$MAIN_REPO" && node scripts/generate-docs.js --routes 2>&1) && \
    echo "   docs/api/reference.md обновлён" || \
    echo "   ⚠️  generate-docs --routes не смог выполниться"
fi

if echo "$FILE" | grep -qE 'prisma/schema\.prisma$'; then
  echo ""
  echo "✅ Авто: schema.prisma изменилась → запускаю generate-docs --schema"
  (cd "$MAIN_REPO" && node scripts/generate-docs.js --schema 2>&1) && \
    echo "   docs/architecture/data-model.md обновлён" || \
    echo "   ⚠️  generate-docs --schema не смог выполниться"
fi

if echo "$FILE" | grep -qE 'backend/src/app\.ts$'; then
  echo ""
  echo "✅ Авто: app.ts изменился → запускаю generate-docs --modules"
  (cd "$MAIN_REPO" && node scripts/generate-docs.js --modules 2>&1) && \
    echo "   docs/architecture/backend-modules.md обновлён" || \
    echo "   ⚠️  generate-docs --modules не смог выполниться"
fi

if echo "$FILE" | grep -qE 'frontend/src/App\.tsx$'; then
  echo ""
  echo "✅ Авто: App.tsx изменился → запускаю generate-docs --frontend"
  (cd "$MAIN_REPO" && node scripts/generate-docs.js --frontend 2>&1) && \
    echo "   docs/architecture/frontend-architecture.md обновлён" || \
    echo "   ⚠️  generate-docs --frontend не смог выполниться"
fi

# ── REMINDERS: docs that need Claude/human context ───────────────────────────

# CLAUDE.md — sprint progress, module status, CI/CD state
if echo "$FILE" | grep -qE 'backend/src/modules/(auth|users|projects|issues|comments|boards|sprints|time|teams|admin|releases)/'; then
  MODULE=$(echo "$FILE" | sed 's|backend/src/modules/\([^/]*\)/.*|\1|')
  remind "Изменён модуль \`$MODULE\`" \
    "Обнови раздел «Текущее состояние» в CLAUDE.md если изменился контракт/поведение" \
    "Обнови docs/ENG/API.md / docs/RU/API.md если изменились endpoint'ы"
  queue_append "CLAUDE.md + API.md" "модуль $MODULE"
fi

# CLAUDE.md — Prisma schema (data model section)
if echo "$FILE" | grep -qE 'prisma/schema\.prisma$'; then
  remind "Изменена Prisma-схема" \
    "Обнови раздел «Иерархия задач» в CLAUDE.md если изменились модели Issue/Sprint" \
    "docs/RU/architecture/MVP_DOMAIN_MODEL.md может устареть"
  queue_append "CLAUDE.md + MVP_DOMAIN_MODEL.md" "schema.prisma"
fi

# UI pages → user manual
if echo "$FILE" | grep -qE 'frontend/src/pages/'; then
  remind "Изменена UI-страница" \
    "Обнови docs/user-manual/ если изменилось поведение для пользователя"
  queue_append "docs/user-manual/" "UI страница"
fi

# UI components/ui → design system
if echo "$FILE" | grep -qE 'frontend/src/components/ui/'; then
  remind "Изменён компонент из /ui/" \
    "Обнови docs/design-system/overview.md если компонент стал публичным или изменился API"
  queue_append "docs/design-system/" "UI компонент"
fi

# Integrations
if echo "$FILE" | grep -qE 'backend/src/modules/(integrations|webhooks|telegram|gitlab)/'; then
  remind "Изменён код интеграции" \
    "Обнови docs/integrations/GITLAB_WEBHOOK.md или docs/integrations/telegram.md"
  queue_append "docs/integrations/" "интеграция"
fi

# Deploy / CI — но не сам doc-reminder и generate-docs
if echo "$FILE" | grep -qE '(deploy/|\.github/workflows/)' && \
   ! echo "$FILE" | grep -qE '(doc-reminder|generate-docs)'; then
  remind "Изменена конфигурация деплоя/CI" \
    "Обнови docs/DEPLOY.md и раздел CI/CD в CLAUDE.md"
  queue_append "CLAUDE.md + docs/DEPLOY.md" "deploy/CI"
fi

# Auth middleware / RBAC
if echo "$FILE" | grep -qE '(middleware|rbac|auth).*\.(ts|js)$'; then
  remind "Изменена авторизация/middleware" \
    "Проверь раздел «Роли RBAC» в CLAUDE.md"
  queue_append "CLAUDE.md (RBAC)" "auth/middleware"
fi

exit 0
