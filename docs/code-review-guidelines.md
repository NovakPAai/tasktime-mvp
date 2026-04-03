# Code Review Guidelines for TaskTime MVP

**Версия:** 1.0
**Дата:** 2026-03-28
**Назначение:** Автоматическое code review (CodeRabbit / Qodo)

---

## КРИТИЧНЫЕ (блокируют PR / require fixes)

### 1. Hardcoded Secrets
**Issue:** API ключи, пароли, tokens в исходном коде
**Action:** Все secrets → `process.env.*`
```javascript
// ❌ WRONG
const API_KEY = "sk-1234567890abcdef";

// ✅ CORRECT
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY not configured");
```

### 2. Missing Input Validation (Zod)
**Issue:** Невалидированный user input / API params
**Action:** Используй Zod schemas на всех API endpoints + React props
```typescript
// ❌ WRONG
function updateIssue(req: Request) {
  const { title } = req.body;  // No validation!
  // ...
}

// ✅ CORRECT
const UpdateIssueDto = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});

function updateIssue(req: Request) {
  const body = UpdateIssueDto.parse(req.body);
  // ...
}
```

### 3. Unhandled Async Errors
**Issue:** Promise / async/await без try-catch
**Action:** Обязательный try-catch для всех async операций
```typescript
// ❌ WRONG
async function fetchIssue(id: string) {
  const issue = await db.issues.findUnique({ where: { id } });
  return issue;
}

// ✅ CORRECT
async function fetchIssue(id: string) {
  try {
    const issue = await db.issues.findUnique({ where: { id } });
    return issue;
  } catch (error) {
    logger.error("Failed to fetch issue", { id, error });
    throw new AppError("Failed to fetch issue", 500);
  }
}
```

### 4. SQL Injection / XSS Risks
**Issue:** Raw SQL, `dangerouslySetInnerHTML`, unsafe DOM manipulations
**Action:** Prisma (parameterized), React auto-escaping, DOMPurify если нужно
```typescript
// ❌ WRONG
const query = `SELECT * FROM issues WHERE id = '${id}'`;

// ✅ CORRECT
const issue = await db.issues.findUnique({ where: { id } });
```

---

## ВЫСОКИЙ ПРИОРИТЕТ (warning — должны исправить)

### 5. Mutation Violations (Immutability)
**Issue:** Мутация объектов вместо создания новых
**Action:** Spread operator, `Object.assign` для создания копий
```typescript
// ❌ WRONG
const issue = await db.issues.findUnique({ where: { id } });
issue.status = "DONE";  // Mutating
issue.priority = "HIGH";

// ✅ CORRECT
const issue = await db.issues.findUnique({ where: { id } });
const updated = {
  ...issue,
  status: "DONE",
  priority: "HIGH",
};
```

### 6. Missing Types on Exported Functions
**Issue:** Export функций/компонентов без явной типизации
**Action:** Явный return type на всех exported
```typescript
// ❌ WRONG
export const getUserById = (id: string) => {
  return db.users.findUnique({ where: { id } });
};

// ✅ CORRECT
export const getUserById = async (id: string): Promise<User | null> => {
  return db.users.findUnique({ where: { id } });
};
```

### 7. Files > 800 Lines
**Issue:** Монолитные компоненты/модули (сложнее reviewed/maintain)
**Action:** Разбить на мелкие файлы (200–400 lines each)
```
❌ AdminPage.tsx (45K lines) → split into:
✅ AdminPage.tsx (main routing)
✅ AdminDashboard.tsx (stats)
✅ AdminUsers.tsx (user management)
✅ AdminProjects.tsx (project settings)
```

### 8. Missing Error Messages for Users
**Issue:** Error responses без human-friendly text
**Action:** Хорошие error messages для UI
```typescript
// ❌ WRONG
throw new Error("Failed");

// ✅ CORRECT
throw new AppError("Не удалось обновить задачу. Проверьте права доступа.", 403);
```

---

## СРЕДНИЙ ПРИОРИТЕТ (info — улучшить на следующей итерации)

### 9. No Tests for New Features (80% target)
**Issue:** Новые feature без unit/integration тестов
**Action:** TDD: пишем тесты перед кодом
```
Coverage target: 80%
Test types: unit + integration + E2E (для критичных flows)
```

### 10. Hardcoded Magic Values
**Issue:** Числовые/строковые constants прямо в коде
**Action:** Выносим в `constants.ts` или env
```typescript
// ❌ WRONG
if (issue.priority === "HIGH" && issue.assignee.count > 5) { }

// ✅ CORRECT
const MAX_ASSIGNEES = 5;
const PRIORITY = { HIGH: "HIGH", MEDIUM: "MEDIUM" };
if (issue.priority === PRIORITY.HIGH && issue.assignee.count > MAX_ASSIGNEES) { }
```

---

## Дополнительные правила (наша culture)

### Immutability (КРИТИЧНОЕ для этого проекта)
Все rules `/rules/common/coding-style.md` остаются в силе:
- Никогда не мутируем объекты в-place
- Всегда создаём новые с `{...obj, field: value}`
- Pure functions только

### RBAC & Authorization
- Все API endpoints проверяют `req.user.role`
- Permission checks в сервисе, не в контроллере
- Audit log для всех мутаций

### Database Safety
- Migrations только forward (no rollbacks)
- Seed data в `prisma/seed.ts`
- Transactions для multi-step operations

---

## Для Code Review Агентов

### Как читать severity

| Severity | Meaning | Action |
|----------|---------|--------|
| 🔴 CRITICAL | Блокирует PR merge | Обязателен fix перед merge |
| 🟡 HIGH | Требует исправления | Should fix, но можно override если justified |
| 🟠 MEDIUM | Улучшить рекомендуется | Nice-to-have, не блокирует |
| 🔵 INFO | Предложение | Consider, но не обязательно |

### Когда агент может ошибаться

- False positives на "mutation" если это intentional pattern
- False negatives на security если используется non-standard lib
- Context-dependent rules (иногда hardcoded OK, если в constants.ts)

**Always:** Human reviewer имеет final say. Агент — помощник, не judge.

---

## История изменений

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-03-28 | Initial version (10 rules из `/rules/common/`) |

