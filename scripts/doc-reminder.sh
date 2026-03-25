#!/usr/bin/env bash
# doc-reminder.sh — Called by Claude Code PostToolUse hook
# Usage: ./scripts/doc-reminder.sh "<edited-file-path>"
# Outputs a reminder message if the file affects documentation

FILE="$1"

if [ -z "$FILE" ]; then
  exit 0
fi

# Normalize path (remove leading ./)
FILE="${FILE#./}"

# Check patterns and output reminder
if echo "$FILE" | grep -qE 'backend/src/modules/[^/]+/[^/]+\.router\.ts'; then
  echo ""
  echo "📋 Doc reminder: Router file changed."
  echo "   → Update docs/api/reference.md with new/changed endpoints"
  echo "   → Run: make docs"
fi

if echo "$FILE" | grep -qE 'backend/src/prisma/schema\.prisma'; then
  echo ""
  echo "📋 Doc reminder: Prisma schema changed."
  echo "   → Update docs/architecture/data-model.md"
  echo "   → Run: make docs"
fi

if echo "$FILE" | grep -qE 'backend/src/app\.ts'; then
  echo ""
  echo "📋 Doc reminder: App routes changed."
  echo "   → Update docs/architecture/backend-modules.md if new module added"
fi

if echo "$FILE" | grep -qE 'frontend/src/App\.tsx'; then
  echo ""
  echo "📋 Doc reminder: Frontend routes changed."
  echo "   → Update docs/architecture/frontend-architecture.md"
fi

if echo "$FILE" | grep -qE 'frontend/src/pages/'; then
  echo ""
  echo "📋 Doc reminder: Frontend page changed."
  echo "   → Update docs/user-manual/features/ if user-visible behavior changed"
  echo "   → Update docs/architecture/frontend-architecture.md if new page added"
fi

exit 0
