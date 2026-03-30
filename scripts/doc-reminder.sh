#!/usr/bin/env bash
# doc-reminder.sh — Called by Claude Code PostToolUse hook
# Only reminds about docs that CANNOT be auto-generated.
# API reference, data model, modules, frontend routes → auto via CI.

FILE="$1"
[ -z "$FILE" ] && exit 0
FILE="${FILE#./}"

# User manual — UI page changes → human must describe what changed
if echo "$FILE" | grep -qE 'frontend/src/pages/'; then
  echo ""
  echo "📋 Ремайндер: Изменена UI-страница."
  echo "   → Обнови docs/user-manual/features/ если изменилось поведение для пользователя"
  echo "   (API reference и роуты обновятся автоматически после мёрджа)"
fi

# Design system — new public components
if echo "$FILE" | grep -qE 'frontend/src/components/ui/'; then
  echo ""
  echo "📋 Ремайндер: Изменён UI-компонент из /ui/."
  echo "   → Обнови docs/design-system/overview.md если компонент стал публичным"
fi

# Integration code
if echo "$FILE" | grep -qE 'backend/src/modules/(integrations|webhooks)/'; then
  echo ""
  echo "📋 Ремайндер: Изменён код интеграции."
  echo "   → Обнови docs/integrations/ (gitlab.md / telegram.md)"
fi

# Deployment config
if echo "$FILE" | grep -qE '(deploy/|\.github/workflows/)' && ! echo "$FILE" | grep -q 'update-docs'; then
  echo ""
  echo "📋 Ремайндер: Изменена конфигурация деплоя/CI."
  echo "   → Обнови docs/guides/deployment.md"
fi

# Auto-generated — just inform
if echo "$FILE" | grep -qE 'backend/src/modules/.*\.router\.ts|backend/src/prisma/schema\.prisma|backend/src/app\.ts|frontend/src/App\.tsx'; then
  echo ""
  echo "✅ Авто-документация обновится сама после мёрджа в main:"
  echo "   docs/api/reference.md • docs/architecture/data-model.md"
  echo "   docs/architecture/backend-modules.md • docs/architecture/frontend-architecture.md"
fi

exit 0
