# ТЗ: Кастомные поля задач — управление администратором

**Эпик:** [TTADM-34](http://5.129.242.171/projects/a79fc85a-573f-4d63-8fc9-3c62881dcf88)
**Дата:** 2026-03-21
**Обновлено:** 2026-03-21 v2 (копирование, черновик/публикация, конфликты, назначение области применения)
**Статус:** Approved
**Автор:** Claude Code (на основе анализа кодовой базы)

---

## 1. Назначение и контекст

Flow Universe MVP является заменой Jira для российского финансового сектора. Заказчики работают с разными типами задач в разных проектах и требуют гибкой кастомизации набора полей — без изменения кода.

**Цель:** Предоставить администратору системы (роли `ADMIN`, `SUPER_ADMIN`) инструменты для управления дополнительными (кастомными) полями задач: создание полей, объединение в схемы, привязка схем к типам задач и проектам. Конечный пользователь видит только те поля, которые настроены для его типа задачи в его проекте.

**Аналог в Jira:** Custom Fields + Field Configuration Schemes + Field Configuration.

---

## 2. Роли и права доступа

| Действие | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|----------|-------------|-------|---------|------|--------|
| Создание / редактирование / удаление кастомных полей | ✅ | ✅ | ❌ | ❌ | ❌ |
| Управление схемами полей | ✅ | ✅ | ❌ | ❌ | ❌ |
| Привязка схем к типам задач и проектам | ✅ | ✅ | ❌ | ❌ | ❌ |
| Заполнение кастомных полей в задаче | ✅ | ✅ | ✅ | ✅ | ❌ |
| Просмотр кастомных полей в задаче | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 3. Доменная модель

### 3.1 Концепция

```
CustomField         — глобальное определение поля (имя, тип, опции)
    ↓ M:M
FieldSchema         — именованная коллекция полей (e.g. «Банковские поля»)
    ↓ биндинги
FieldSchemaBinding  — к чему привязана схема (проект, тип задачи, или пара)

Логика рендера:
Для задачи типа T в проекте P — показать поля из всех схем,
у которых есть binding совпадающий с T и/или P (union).

Если ни одна схема не применима → показывать только системные поля задачи
(стандартные поля Issue-модели). Секция «Дополнительные поля» не рендерится.
```

> **Решение PO:** дефолтная схема НЕ применяется автоматически. Кастомные поля
> появляются только если администратор явно привязал схему к типу задачи или проекту.

### 3.2 Жизненный цикл схемы

Схема существует в двух состояниях:

```
DRAFT  ──[Сохранить и применить]──▶  ACTIVE
  ▲                                     │
  └──────────[Редактировать]────────────┘
```

- **DRAFT** — схема создана или редактируется. **Не участвует** в разрешении кастомных полей задач. Можно свободно изменять поля, порядок, биндинги.
- **ACTIVE** — схема применяется ко всем задачам согласно биндингам. При переходе в ACTIVE выполняется проверка конфликтов.

**Переход DRAFT → ACTIVE** («Сохранить и применить»):
1. Backend проверяет конфликты с другими ACTIVE схемами
2. Если конфликтов нет → статус меняется на `ACTIVE`
3. Если есть конфликты → возвращает список конфликтов (422), статус остаётся `DRAFT`

**Редактирование ACTIVE схемы** → автоматически переводит в `DRAFT`. Схема продолжает применяться в старом состоянии до следующего «Сохранить и применить».

> Фактически: каждое редактирование создаёт «несохранённое» состояние. Backend хранит только текущее состояние + флаг `status`.

### 3.3 Конфликты при публикации схемы

**Конфликт** — ситуация, когда одно и то же кастомное поле входит в две ACTIVE схемы с **одинаковым приоритетом scope**, применимым к пересекающемуся множеству задач.

Если одно поле есть в двух схемах с разным приоритетом scope — это не конфликт (более специфичная схема побеждает, это ожидаемое поведение). Конфликт возникает только на **одном уровне приоритета**.

**Типы конфликтов:**

| Код | Суть | Пример |
|-----|------|--------|
| `FIELD_DUPLICATE_SAME_SCOPE` | Поле X присутствует в двух схемах с одинаковым scopeType и одинаковыми project/type | Схемы «А» и «Б» обе имеют `PROJECT` binding для проекта TTMP и обе содержат поле «Уровень риска» |
| `REQUIRED_MISMATCH` | Поле X обязательное в схеме А, необязательное в схеме Б, обе применяются к одному scope с одинаковым приоритетом | Неоднозначность: блокировать DONE или нет? |
| `KANBAN_OVERFLOW` | Более 3 полей с `showOnKanban = true` применяются к одному типу задачи в одном проекте | На карточке будет показано только 3 — поведение неоднозначно |

**Формат конфликта (в ответе и в файле экспорта):**
```typescript
{
  conflictType: 'FIELD_DUPLICATE_SAME_SCOPE' | 'REQUIRED_MISMATCH' | 'KANBAN_OVERFLOW';
  severity: 'ERROR' | 'WARNING';
  description: string;           // человекочитаемое описание
  customFieldId: string;
  customFieldName: string;
  conflictingSchemaId: string;
  conflictingSchemaName: string;
  scope: {
    scopeType: FieldScopeType;
    projectName?: string;
    issueTypeName?: string;
  };
}
```

- `FIELD_DUPLICATE_SAME_SCOPE` и `REQUIRED_MISMATCH` — severity `ERROR`, **блокируют** публикацию
- `KANBAN_OVERFLOW` — severity `WARNING`, **не блокирует**, но показывается в модалке

### 3.4 Обязательность полей

**Обязательность (`isRequired`) настраивается исключительно на уровне схемы** — в `FieldSchemaItem`.
На уровне `CustomField` флаг `isRequired` отсутствует: одно и то же поле может быть
обязательным в одной схеме и необязательным в другой.

> **Решение PO:** переход задачи в статус `DONE` **блокируется** на backend если есть
> незаполненные обязательные кастомные поля. Ошибка содержит список конкретных полей.

### 3.5 Приоритет схем (наиболее специфичный приоритет)

Если поле присутствует в нескольких схемах — берётся настройка из наиболее специфичной:

1. `scopeType = PROJECT_ISSUE_TYPE` (проект + тип задачи) — наивысший приоритет
2. `scopeType = PROJECT` (только проект)
3. `scopeType = ISSUE_TYPE` (только тип задачи)
4. `scopeType = GLOBAL` (ко всем задачам)

---

## 4. Схема БД (Prisma)

### 4.1 Новые модели

```prisma
// Статус схемы полей
enum FieldSchemaStatus {
  DRAFT   // редактируется, не применяется к задачам
  ACTIVE  // применяется к задачам согласно биндингам
}

// Типы данных кастомного поля
enum CustomFieldType {
  TEXT          // однострочный текст
  TEXTAREA      // многострочный текст
  NUMBER        // целое или десятичное число
  DECIMAL       // число с плавающей точкой (6,2)
  DATE          // дата (без времени)
  DATETIME      // дата + время
  URL           // ссылка (валидируется как URL)
  CHECKBOX      // boolean да/нет
  SELECT        // одиночный выбор из списка
  MULTI_SELECT  // множественный выбор из списка
  USER          // ссылка на пользователя системы
  LABEL         // свободные теги (массив строк)
}

// Глобальное определение поля
model CustomField {
  id          String          @id @default(uuid())
  name        String
  description String?
  fieldType   CustomFieldType @map("field_type")
  // JSON: [{ value: string, label: string, color?: string }]
  // Только для SELECT / MULTI_SELECT
  options     Json?
  // isRequired намеренно отсутствует — обязательность задаётся в FieldSchemaItem
  isSystem    Boolean         @default(false) @map("is_system")
  isEnabled   Boolean         @default(true)  @map("is_enabled")
  orderIndex  Int             @default(0)      @map("order_index")
  createdAt   DateTime        @default(now())  @map("created_at")
  updatedAt   DateTime        @updatedAt       @map("updated_at")

  schemaItems FieldSchemaItem[]
  values      IssueCustomFieldValue[]

  @@map("custom_fields")
}

// Именованная схема (коллекция полей)
model FieldSchema {
  id          String            @id @default(uuid())
  name        String
  description String?
  status      FieldSchemaStatus @default(DRAFT)
  // isDefault: применяется как fallback если нет другой подходящей ACTIVE схемы
  // (только одна схема может быть isDefault = true и status = ACTIVE)
  isDefault   Boolean           @default(false) @map("is_default")
  // copiedFromId: ссылка на оригинал при копировании (аудит)
  copiedFromId String?          @map("copied_from_id")
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt      @map("updated_at")

  items      FieldSchemaItem[]
  bindings   FieldSchemaBinding[]
  copiedFrom FieldSchema?      @relation("SchemaCopies", fields: [copiedFromId], references: [id], onDelete: SetNull)
  copies     FieldSchema[]     @relation("SchemaCopies")

  @@map("field_schemas")
}

// Поля внутри схемы (с порядком, обязательностью и флагом видимости на Kanban)
model FieldSchemaItem {
  id            String  @id @default(uuid())
  schemaId      String  @map("schema_id")
  customFieldId String  @map("custom_field_id")
  orderIndex    Int     @default(0)     @map("order_index")
  // Обязательность задаётся здесь — не в CustomField
  isRequired    Boolean @default(false) @map("is_required")
  // Показывать ли поле на Kanban-карточке (компактный вид)
  showOnKanban  Boolean @default(false) @map("show_on_kanban")

  schema      FieldSchema  @relation(fields: [schemaId], references: [id], onDelete: Cascade)
  customField CustomField  @relation(fields: [customFieldId], references: [id], onDelete: Cascade)

  @@unique([schemaId, customFieldId])
  @@index([schemaId])
  @@map("field_schema_items")
}

// Scope type для биндинга
// Соответствие пользовательского языка → enum:
//   «Для всех проектов, для всех типов»  → GLOBAL
//   «Для всех проектов, конкретный тип»  → ISSUE_TYPE
//   «Конкретный проект, для всех типов»  → PROJECT      ← «Для всех типов задач» в UI
//   «Конкретный проект, конкретный тип»  → PROJECT_ISSUE_TYPE
enum FieldScopeType {
  GLOBAL            // все проекты, все типы задач
  PROJECT           // конкретный проект, все типы задач
  ISSUE_TYPE        // все проекты, конкретный тип задачи
  PROJECT_ISSUE_TYPE // конкретный проект, конкретный тип задачи
}

// Привязка схемы к области применения
model FieldSchemaBinding {
  id                String         @id @default(uuid())
  schemaId          String         @map("schema_id")
  scopeType         FieldScopeType @map("scope_type")
  projectId         String?        @map("project_id")
  issueTypeConfigId String?        @map("issue_type_config_id")
  createdAt         DateTime       @default(now()) @map("created_at")

  schema          FieldSchema      @relation(fields: [schemaId], references: [id], onDelete: Cascade)
  project         Project?         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  issueTypeConfig IssueTypeConfig? @relation(fields: [issueTypeConfigId], references: [id], onDelete: Cascade)

  @@unique([schemaId, scopeType, projectId, issueTypeConfigId])
  @@index([schemaId])
  @@index([projectId])
  @@index([issueTypeConfigId])
  @@map("field_schema_bindings")
}

// Значения кастомных полей для конкретной задачи
model IssueCustomFieldValue {
  id            String   @id @default(uuid())
  issueId       String   @map("issue_id")
  customFieldId String   @map("custom_field_id")
  // Значение хранится как JSONB:
  // TEXT/TEXTAREA/URL  → { "v": "string" }
  // NUMBER/DECIMAL     → { "v": 42 }
  // DATE               → { "v": "2026-03-21" }
  // DATETIME           → { "v": "2026-03-21T10:00:00Z" }
  // CHECKBOX           → { "v": true }
  // SELECT             → { "v": "option_value" }
  // MULTI_SELECT/LABEL → { "v": ["a","b"] }
  // USER               → { "v": "user_uuid" }
  value         Json
  updatedAt     DateTime @updatedAt @map("updated_at")
  updatedById   String   @map("updated_by_id")

  issue       Issue       @relation(fields: [issueId], references: [id], onDelete: Cascade)
  customField CustomField @relation(fields: [customFieldId], references: [id], onDelete: Cascade)
  updatedBy   User        @relation(fields: [updatedById], references: [id])

  @@unique([issueId, customFieldId])
  @@index([issueId])
  @@map("issue_custom_field_values")
}
```

### 4.2 Изменения в существующих моделях

```prisma
// Project — добавить relation:
fieldSchemaBindings FieldSchemaBinding[]

// IssueTypeConfig — добавить relation:
fieldSchemaBindings FieldSchemaBinding[]

// Issue — добавить relation:
customFieldValues IssueCustomFieldValue[]
```

### 4.3 Миграция

```bash
cd backend && npx prisma migrate dev --name add_custom_fields
npm run db:generate
npm run typecheck
```

---

## 5. Backend API

### 5.1 Кастомные поля (`/api/admin/custom-fields`)

| Метод | Эндпоинт | Доступ | Описание |
|-------|----------|--------|----------|
| GET | `/api/admin/custom-fields` | ADMIN+ | Список всех кастомных полей |
| POST | `/api/admin/custom-fields` | ADMIN+ | Создать поле |
| GET | `/api/admin/custom-fields/:id` | ADMIN+ | Получить поле |
| PATCH | `/api/admin/custom-fields/:id` | ADMIN+ | Редактировать поле |
| DELETE | `/api/admin/custom-fields/:id` | ADMIN+ | Удалить поле (если не `isSystem`) |
| PATCH | `/api/admin/custom-fields/:id/toggle` | ADMIN+ | Включить/выключить поле |
| PATCH | `/api/admin/custom-fields/reorder` | ADMIN+ | Изменить порядок |

**DTO `CreateCustomFieldDto`:**
```typescript
{
  name: string;            // required, max 100
  description?: string;
  fieldType: CustomFieldType;
  options?: Array<{        // required for SELECT/MULTI_SELECT
    value: string;
    label: string;
    color?: string;        // hex color, optional
  }>;
  // isRequired отсутствует — обязательность задаётся в схеме
}
```

**Бизнес-правила:**
- `isSystem = true` — поле нельзя удалить, только деактивировать
- При удалении поля: каскадно удаляются `FieldSchemaItem` и `IssueCustomFieldValue`
- `fieldType` нельзя изменить после создания, если у поля есть значения в задачах
- Для `SELECT`/`MULTI_SELECT` — опции можно добавлять, но нельзя удалять если есть значения с этой опцией

---

### 5.2 Схемы полей (`/api/admin/field-schemas`)

| Метод | Эндпоинт | Доступ | Описание |
|-------|----------|--------|----------|
| GET | `/api/admin/field-schemas` | ADMIN+ | Список схем (с items и bindings) |
| POST | `/api/admin/field-schemas` | ADMIN+ | Создать схему (создаётся в статусе DRAFT) |
| GET | `/api/admin/field-schemas/:id` | ADMIN+ | Получить схему |
| PATCH | `/api/admin/field-schemas/:id` | ADMIN+ | Редактировать метаданные (→ DRAFT если была ACTIVE) |
| DELETE | `/api/admin/field-schemas/:id` | ADMIN+ | Удалить схему (если не дефолтная ACTIVE) |
| POST | `/api/admin/field-schemas/:id/copy` | ADMIN+ | Копировать схему |
| POST | `/api/admin/field-schemas/:id/publish` | ADMIN+ | Проверить конфликты и активировать (DRAFT → ACTIVE) |
| POST | `/api/admin/field-schemas/:id/unpublish` | ADMIN+ | Деактивировать (ACTIVE → DRAFT) |
| PATCH | `/api/admin/field-schemas/:id/set-default` | ADMIN+ | Назначить схему по умолчанию |
| GET | `/api/admin/field-schemas/:id/conflicts` | ADMIN+ | Предварительная проверка конфликтов (без публикации) |
| PUT | `/api/admin/field-schemas/:id/items` | ADMIN+ | Полная замена полей в схеме |
| POST | `/api/admin/field-schemas/:id/items` | ADMIN+ | Добавить поле в схему |
| DELETE | `/api/admin/field-schemas/:id/items/:itemId` | ADMIN+ | Убрать поле из схемы |
| PATCH | `/api/admin/field-schemas/:id/items/reorder` | ADMIN+ | Изменить порядок полей |
| GET | `/api/admin/field-schemas/:id/bindings` | ADMIN+ | Список биндингов схемы |
| POST | `/api/admin/field-schemas/:id/bindings` | ADMIN+ | Добавить биндинг |
| DELETE | `/api/admin/field-schemas/:id/bindings/:bindingId` | ADMIN+ | Удалить биндинг |

**DTO `CreateFieldSchemaDto`:**
```typescript
{
  name: string;         // required, max 100
  description?: string;
  // isDefault устанавливается отдельным эндпоинтом set-default
}
```

**DTO `CopyFieldSchemaDto`:**
```typescript
{
  name: string;         // имя копии, required
  description?: string;
  copyBindings?: boolean; // копировать ли биндинги (default: false)
  // копия всегда создаётся в статусе DRAFT
}
```

**DTO `AddFieldSchemaItemDto`:**
```typescript
{
  customFieldId: string;
  orderIndex?: number;
  isRequired: boolean;    // обязательно указать — обязательность задаётся только здесь
  showOnKanban?: boolean; // default false
}
```

**DTO `CreateFieldSchemaBindingDto`:**
```typescript
{
  // Пользовательский язык → scopeType:
  // «Все проекты, все типы»      → scopeType: GLOBAL
  // «Все проекты, конкретный тип» → scopeType: ISSUE_TYPE, issueTypeConfigId: required
  // «Проект, все типы»            → scopeType: PROJECT, projectId: required
  // «Проект + тип»                → scopeType: PROJECT_ISSUE_TYPE, оба required
  scopeType: 'GLOBAL' | 'PROJECT' | 'ISSUE_TYPE' | 'PROJECT_ISSUE_TYPE';
  projectId?: string;         // required if scopeType = PROJECT | PROJECT_ISSUE_TYPE
  issueTypeConfigId?: string; // required if scopeType = ISSUE_TYPE | PROJECT_ISSUE_TYPE
}
```

**Response `POST /api/admin/field-schemas/:id/publish` при конфликтах (422):**
```typescript
{
  error: 'SCHEMA_PUBLISH_CONFLICTS',
  message: 'Схема не может быть опубликована из-за конфликтов',
  errors: ConflictItem[];   // блокирующие (severity: ERROR)
  warnings: ConflictItem[]; // некритичные (severity: WARNING)
}

type ConflictItem = {
  conflictType: 'FIELD_DUPLICATE_SAME_SCOPE' | 'REQUIRED_MISMATCH' | 'KANBAN_OVERFLOW';
  severity: 'ERROR' | 'WARNING';
  description: string;
  customFieldId: string;
  customFieldName: string;
  conflictingSchemaId: string;
  conflictingSchemaName: string;
  scope: { scopeType: string; projectName?: string; issueTypeName?: string };
}
```

Если есть только `warnings` (нет `errors`) — публикация выполняется, но warnings возвращаются в теле 200.

**Бизнес-правила:**
- Новая схема создаётся в статусе `DRAFT`
- Копия схемы создаётся в статусе `DRAFT`; `copiedFromId` = id оригинала
- `isDefault = true` может быть только у одной схемы одновременно (SET DEFAULT снимает флаг у предыдущей)
- `isDefault` схема должна быть в статусе `ACTIVE`
- Редактирование ACTIVE схемы (поля, порядок, биндинги) автоматически переводит её в `DRAFT`
- Удалить можно только схему в статусе `DRAFT`; ACTIVE схему нужно сначала деактивировать
- `GLOBAL` binding не может существовать одновременно с другим `GLOBAL` binding в другой ACTIVE схеме (если поля пересекаются — это конфликт при публикации)

---

### 5.3 Кастомные поля задачи (`/api/issues/:id/custom-fields`)

| Метод | Эндпоинт | Доступ | Описание |
|-------|----------|--------|----------|
| GET | `/api/issues/:id/custom-fields` | Authenticated | Получить применимые схемы + значения задачи |
| PUT | `/api/issues/:id/custom-fields` | USER+ | Обновить значения кастомных полей (batch) |

**Response `GET /api/issues/:id/custom-fields`:**
```typescript
{
  fields: Array<{
    customFieldId: string;
    name: string;
    description?: string;
    fieldType: CustomFieldType;
    options?: FieldOption[];
    isRequired: boolean;         // из FieldSchemaItem.isRequired
    showOnKanban: boolean;       // из FieldSchemaItem.showOnKanban
    orderIndex: number;
    schemaName: string;          // название схемы-источника
    value: Json | null;          // текущее значение или null
  }>;
}
```

**DTO `UpdateIssueCustomFieldsDto`:**
```typescript
{
  values: Array<{
    customFieldId: string;
    value: Json | null; // null = удалить значение
  }>;
}
```

**Бизнес-правила:**
- Все изменения значений логируются в `AuditLog` (action = `CUSTOM_FIELD_UPDATED`)
- При PUT — если поле не принадлежит применимым схемам задачи, вернуть 400

**Блокировка перехода в DONE (`PATCH /api/issues/:id/status`):**

При `status = DONE` backend **до** обновления статуса проверяет все обязательные поля:

```typescript
// Псевдокод
if (newStatus === 'DONE') {
  const applicableFields = await getApplicableFields(issueId);
  const requiredFields = applicableFields.filter(f => f.isRequired);
  const values = await getIssueCustomFieldValues(issueId);

  const missing = requiredFields.filter(f => {
    const val = values.find(v => v.customFieldId === f.customFieldId);
    return !val || val.value?.v === null || val.value?.v === '' ||
           (Array.isArray(val.value?.v) && val.value.v.length === 0);
  });

  if (missing.length > 0) {
    throw new AppError(422, 'REQUIRED_FIELDS_MISSING', {
      message: 'Заполните обязательные поля перед закрытием задачи',
      fields: missing.map(f => ({ customFieldId: f.customFieldId, name: f.name })),
    });
  }
}
```

**Формат ответа 422:**
```json
{
  "error": "REQUIRED_FIELDS_MISSING",
  "message": "Заполните обязательные поля перед закрытием задачи",
  "fields": [
    { "customFieldId": "uuid", "name": "Уровень риска" },
    { "customFieldId": "uuid", "name": "Регуляторная ссылка" }
  ]
}
```

---

### 5.4 Публичные эндпоинты

| Метод | Эндпоинт | Доступ | Описание |
|-------|----------|--------|----------|
| GET | `/api/projects/:projectId/field-schemas` | Authenticated | Схемы и поля, применимые в проекте (для UI форм создания задачи) |
| GET | `/api/projects/:projectId/issues` | Authenticated | Список задач. Новый параметр: `?includeKanbanFields=true` — включает кастомные поля с `showOnKanban = true` в ответ каждой задачи (только для Board view) |

---

## 6. Frontend — Admin UI

### 6.1 Новые страницы в Admin панели

Добавить в `/frontend/src/pages/admin/`:

#### `AdminCustomFieldsPage.tsx`

**URL:** `/admin/custom-fields`

**Функциональность:**
- Таблица всех кастомных полей: имя, тип, обязательное, включено, кол-во схем
- Кнопка «+ Добавить поле» → модальное окно
- Строка таблицы → inline-действия: Редактировать, Вкл/Выкл, Удалить
- Drag-and-drop сортировка (или кнопки ↑↓) для изменения `orderIndex`

**Форма создания/редактирования поля:**
```
Название*           [Text Input]
Описание            [Text Input]
Тип данных*         [Select: TEXT | TEXTAREA | NUMBER | DATE | ...]
                    → при выборе показывать иконку и подсказку
Варианты ответов    [Только для SELECT/MULTI_SELECT]
                    [List: Value | Отображаемое имя | Цвет [+Добавить]]
```

> ⚠️ Флага «Обязательное» здесь **нет** — обязательность задаётся в настройках схемы для каждого поля отдельно.

**Ограничения UI:**
- Если у поля есть значения в задачах — "Тип данных" заблокирован (tooltip: «Нельзя изменить тип, есть данные»)
- Поля `isSystem = true` — нет кнопки «Удалить», только «Вкл/Выкл»
- Перед удалением — предупреждение: «Будут удалены все значения этого поля в задачах»

---

#### `AdminFieldSchemasPage.tsx`

**URL:** `/admin/field-schemas`

**Функциональность:**
- Таблица схем: имя, описание, статус (badge: `DRAFT`/`ACTIVE`), по умолчанию, кол-во полей, кол-во биндингов
- Кнопка «+ Создать схему»
- Действия в строке: **Редактировать**, **Копировать**, **Опубликовать** (если DRAFT), **Деактивировать** (если ACTIVE), **По умолчанию** (если ACTIVE), **Удалить** (если DRAFT)

**Значения badge статуса:**
- `DRAFT` — серый badge, tooltip «Схема не применяется к задачам»
- `ACTIVE` — зелёный badge
- `ACTIVE` + `isDefault` — зелёный badge + звёздочка ★

**`AdminFieldSchemaDetailPage.tsx`**

**URL:** `/admin/field-schemas/:id`

**Шапка страницы:**
```
[← Назад к схемам]
Название схемы           [badge: DRAFT / ACTIVE ★]
Описание                 Скопировано из: «Исходная схема» (если копия)

[Редактировать]  [Копировать]  [Сохранить и применить]  [Деактивировать]
```

- **«Сохранить и применить»** — активен только если `status = DRAFT`; запускает `POST /publish`
- **«Деактивировать»** — активен только если `status = ACTIVE`; переводит в DRAFT
- Кнопка «Назначить по умолчанию» — активна только если `status = ACTIVE`

**Layout: три секции (вертикальный аккордеон или три панели):**

**Секция 1 — Основное:**
- Имя схемы (inline-редактирование)
- Описание (inline-редактирование)
- Поле «Скопировано из» — read-only ссылка на оригинал (если `copiedFromId != null`)

**Секция 2 — Поля в схеме:**
- Список полей схемы с `orderIndex`
- Drag-and-drop для сортировки
- Кнопка «+ Добавить поле» → Select из всех `isEnabled = true` полей (уже добавленные — скрыты)
- Для каждого поля отображается строка:

| ⠿ | Поле | Тип | Обязательное | На Kanban | Действие |
|---|------|-----|:------------:|:---------:|----------|
| drag | Уровень риска | SELECT | `[Checkbox]` | `[Checkbox]` | [Удалить] |
| drag | Регуляторная ссылка | TEXT | `[Checkbox]` | `[Checkbox]` | [Удалить] |

- **Обязательное** (`isRequired`) — если включено: при переводе задачи в `DONE` поле должно быть заполнено, иначе backend вернёт ошибку с именем поля
- **На Kanban** (`showOnKanban`) — если включено: значение поля отображается на Kanban-карточке задачи (компактный формат)

**Секция 3 — Привязки (биндинги):**

Таблица существующих биндингов:

| Проекты | Типы задач | Действие |
|---------|------------|----------|
| Все проекты | Все типы | [Удалить] |
| Все проекты | Epic | [Удалить] |
| TTMP, Bank API | Все типы | [Удалить] |
| TTMP | Bug | [Удалить] |

Кнопка «+ Добавить привязку» → модальное окно с **визуальным выбором** (не enum):

```
┌─ Область применения ───────────────────────────────┐
│                                                     │
│  Проекты:                                           │
│  ◉ Все проекты      ← scopeType GLOBAL / ISSUE_TYPE │
│  ○ Выбрать проекты  [MultiSelect: проекты]          │
│                                                     │
│  Типы задач:                                        │
│  ◉ Все типы задач   ← PROJECT / GLOBAL              │
│  ○ Выбрать типы     [MultiSelect: IssueTypeConfig]  │
│                                                     │
│  Итоговая область:  «Все проекты, тип Epic»         │
│           [Отмена]         [Добавить привязку]      │
└─────────────────────────────────────────────────────┘
```

> Если выбрано «Все проекты» + «Все типы» → `scopeType = GLOBAL`
> Если выбрано «Все проекты» + конкретные типы → несколько биндингов `ISSUE_TYPE` (по одному на тип)
> Если выбраны конкретные проекты + «Все типы» → несколько биндингов `PROJECT` (по одному на проект)
> Если выбраны конкретные проекты + конкретные типы → несколько биндингов `PROJECT_ISSUE_TYPE`
>
> Один клик «Добавить привязку» может создать несколько записей `FieldSchemaBinding`

#### Модальное окно конфликтов при публикации

Показывается когда `POST /publish` возвращает 422 (или 200 с warnings):

```
┌─ Обнаружены конфликты схемы ──────────────────────────────────────────┐
│                                                                        │
│  ❌ Ошибки (блокируют публикацию)                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Поле «Уровень риска»                                             │  │
│  │ Дубль в схеме «Банковские поля» (Проект: TTMP, тип: все)        │  │
│  │ Оба биндинга имеют одинаковый приоритет — неоднозначность        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Поле «Регуляторная ссылка»                                       │  │
│  │ Дубль в схеме «Банковские поля»: там обязательное, здесь нет    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ⚠️ Предупреждения (публикация возможна)                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ На Kanban-карточке типа «Bug» в проекте TTMP будет 4 поля       │  │
│  │ (показывается максимум 3). Уточните настройки showOnKanban.     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [⬇ Скачать конфликты .json]  [Отмена]  [Опубликовать с ⚠️ warnings] │
└────────────────────────────────────────────────────────────────────────┘
```

- **«Скачать конфликты .json»** — скачивает файл `conflicts-<schema-name>-<date>.json` с полным массивом `ConflictItem[]`
- **«Опубликовать с ⚠️ warnings»** — кнопка активна только если нет `ERROR`-конфликтов (только warnings); выполняет публикацию
- **«Отмена»** — закрывает модалку, схема остаётся в DRAFT

**Формат файла конфликтов:**
```json
{
  "schemaId": "uuid",
  "schemaName": "Финансовые поля",
  "exportedAt": "2026-03-21T10:00:00Z",
  "errors": [
    {
      "conflictType": "FIELD_DUPLICATE_SAME_SCOPE",
      "severity": "ERROR",
      "description": "Поле «Уровень риска» дублируется в схеме «Банковские поля» на уровне PROJECT для проекта TTMP",
      "customFieldId": "...",
      "customFieldName": "Уровень риска",
      "conflictingSchemaId": "...",
      "conflictingSchemaName": "Банковские поля",
      "scope": { "scopeType": "PROJECT", "projectName": "TTMP" }
    }
  ],
  "warnings": [
    {
      "conflictType": "KANBAN_OVERFLOW",
      "severity": "WARNING",
      "description": "Для типа «Bug» в проекте TTMP определено 4 поля с showOnKanban=true (максимум 3)",
      "customFieldId": null,
      "customFieldName": null,
      "conflictingSchemaId": null,
      "conflictingSchemaName": null,
      "scope": { "scopeType": "PROJECT_ISSUE_TYPE", "projectName": "TTMP", "issueTypeName": "Bug" }
    }
  ]
}
```

---

### 6.2 Изменения в существующих страницах

#### `IssueDetailPage.tsx`

В сайдбар «Детали» добавить секцию **«Дополнительные поля»** после стандартных полей.

```
── Детали ──────────────────────────────
  Статус:         [dropdown]
  Приоритет:      [tag]
  Исполнитель:    [select]
  ...

── Дополнительные поля ─────────────────
  [Название поля 1]  [Input в зависимости от типа]
  [Название поля 2]  [Input в зависимости от типа]
  ...
  (если кастомных полей нет — секция не рендерится)
```

**Компоненты для отображения по типу:**

| Тип поля | Read View | Edit View (inline) |
|----------|-----------|--------------------|
| TEXT | `<Typography.Text>` | `<Input>` |
| TEXTAREA | `<Typography.Paragraph>` | `<Input.TextArea>` |
| NUMBER / DECIMAL | `<Typography.Text>` | `<InputNumber>` |
| DATE | `<DatePicker>` read | `<DatePicker>` |
| DATETIME | форматированная дата+время | `<DatePicker showTime>` |
| URL | `<Typography.Link href>` | `<Input type="url">` |
| CHECKBOX | `<Checkbox disabled>` | `<Checkbox>` |
| SELECT | `<Tag color>` | `<Select>` с цветными тегами |
| MULTI_SELECT | `<Tag color>` × N | `<Select mode="multiple">` |
| USER | Аватар + имя | `<Select>` из списка пользователей |
| LABEL | `<Tag>` × N | `<Select mode="tags">` |

**Логика:**
- При загрузке `IssueDetailPage` выполнять `GET /api/issues/:id/custom-fields`
- Inline-редактирование: клик на значение → input, blur/Enter → `PUT /api/issues/:id/custom-fields`
- Если поле `isRequired` и значение пустое — маркировать красной звёздочкой `*` и подсказкой «Обязательное поле»
- При попытке перевести статус в `DONE` и получении 422 — показывать `<Modal>` с заголовком «Заполните обязательные поля» и списком незаполненных полей с кнопкой «Перейти к полям» (скролл к секции)

**UI ошибки незаполненных полей:**
```
┌─ Нельзя закрыть задачу ────────────────────────┐
│ Заполните обязательные поля:                    │
│  • Уровень риска                                │
│  • Регуляторная ссылка                          │
│                                                 │
│           [Отмена]  [Перейти к полям →]         │
└─────────────────────────────────────────────────┘
```

#### Kanban-карточка (`KanbanBoard.tsx` / карточка задачи)

Если для задачи есть поля с `showOnKanban = true` — отображать их под заголовком карточки компактно.

**Формат отображения на карточке:**
```
┌─────────────────────────────────────┐
│ TTMP-42  🔴 Bug                     │
│ Ошибка авторизации через SSO        │
│ ─────────────────────────────────── │
│ Уровень риска:   🔴 Критический     │
│ Reg. ссылка:     ФЗ-152 ст.19       │
│ ─────────────────────────────────── │
│ 👤 Иванов   📅 Sprint 4             │
└─────────────────────────────────────┘
```

- Показывать максимум **3 поля** (по `orderIndex`), остальные скрыть
- Типы NUMBER/DECIMAL — показывать числовое значение
- Типы SELECT/MULTI_SELECT — показывать цветной `<Tag>`
- Типы TEXT/TEXTAREA — обрезать до 30 символов с «…»
- Типы DATE — краткий формат `ДД.ММ.YYYY`
- Типы USER — имя пользователя
- Типы CHECKBOX — иконка ✅/☐
- Если значение пустое и поле `isRequired` — показывать плашку `⚠ Не заполнено`

**Логика загрузки:**
- Данные кастомных полей с `showOnKanban = true` включаются в ответ `GET /api/projects/:projectId/issues` (опционально через `?includeKanbanFields=true`)
- Отдельный запрос на каждую карточку **недопустим**

#### Форма создания задачи (`ProjectDetailPage.tsx` / `IssueCreateModal`)

При создании задачи:
1. После выбора типа задачи — запрашивать `GET /api/projects/:projectId/field-schemas` фильтруя по типу
2. Рендерить кастомные поля в форме (обязательные — с `required`)
3. Значения передавать при `POST /api/projects/:projectId/issues` через отдельный `PUT` сразу после создания

> **Примечание для реализации:** в MVP допустимо сохранять кастомные поля вторым запросом после создания задачи. В будущем — встроить в тело `createIssue`.

---

## 7. Алгоритм разрешения применимых схем

```typescript
// Псевдокод service: getApplicableFieldsForIssue(issue)
async function getApplicableFields(issueId: string) {
  const issue = await getIssueWithTypeAndProject(issueId);

  const bindings = await prisma.fieldSchemaBinding.findMany({
    where: {
      // Только ACTIVE схемы участвуют в разрешении полей
      schema: { status: 'ACTIVE' },
      OR: [
        { scopeType: 'GLOBAL' },
        { scopeType: 'PROJECT', projectId: issue.projectId },
        { scopeType: 'ISSUE_TYPE', issueTypeConfigId: issue.issueTypeConfigId },
        { scopeType: 'PROJECT_ISSUE_TYPE',
          projectId: issue.projectId,
          issueTypeConfigId: issue.issueTypeConfigId },
      ]
    },
    include: {
      schema: {
        include: {
          items: {
            include: { customField: true },
            orderBy: { orderIndex: 'asc' }
          }
        }
      }
    }
  });

  // Приоритет: PROJECT_ISSUE_TYPE > PROJECT > ISSUE_TYPE > GLOBAL
  const SCOPE_PRIORITY = {
    PROJECT_ISSUE_TYPE: 4,
    PROJECT: 3,
    ISSUE_TYPE: 2,
    GLOBAL: 1,
  };

  // Deduplicate: если одно поле есть в нескольких схемах — берём из наиболее специфичной
  const fieldMap = new Map<string, ResolvedField>();

  const sortedBindings = bindings.sort(
    (a, b) => SCOPE_PRIORITY[a.scopeType] - SCOPE_PRIORITY[b.scopeType]
  );

  for (const binding of sortedBindings) {
    for (const item of binding.schema.items) {
      if (!item.customField.isEnabled) continue;

      const existing = fieldMap.get(item.customFieldId);
      const priority = SCOPE_PRIORITY[binding.scopeType];

      if (!existing || priority > existing.priority) {
        fieldMap.set(item.customFieldId, {
          ...item.customField,
          // isRequired берётся только из FieldSchemaItem, не из CustomField
          isRequired: item.isRequired,
          showOnKanban: item.showOnKanban,
          orderIndex: item.orderIndex,
          schemaName: binding.schema.name,
          priority,
        });
      }
    }
  }

  return Array.from(fieldMap.values())
    .sort((a, b) => a.orderIndex - b.orderIndex);
}
```

---

## 8. Валидация значений

На backend при сохранении `IssueCustomFieldValue.value`:

```typescript
function validateFieldValue(field: CustomField, value: Json): void {
  switch (field.fieldType) {
    case 'TEXT':
    case 'TEXTAREA':
      assert(typeof value.v === 'string', 'Должна быть строка');
      break;
    case 'NUMBER':
      assert(Number.isInteger(value.v), 'Должно быть целое число');
      break;
    case 'DECIMAL':
      assert(typeof value.v === 'number', 'Должно быть число');
      break;
    case 'DATE':
      assert(/^\d{4}-\d{2}-\d{2}$/.test(value.v), 'Формат: YYYY-MM-DD');
      break;
    case 'DATETIME':
      assert(isValidISODate(value.v), 'Формат: ISO 8601');
      break;
    case 'URL':
      assert(isValidURL(value.v), 'Некорректный URL');
      break;
    case 'CHECKBOX':
      assert(typeof value.v === 'boolean', 'Должно быть true/false');
      break;
    case 'SELECT':
      const optionValues = field.options.map(o => o.value);
      assert(optionValues.includes(value.v), 'Недопустимое значение');
      break;
    case 'MULTI_SELECT':
    case 'LABEL':
      assert(Array.isArray(value.v), 'Должен быть массив');
      break;
    case 'USER':
      assert(isValidUUID(value.v), 'Должен быть UUID пользователя');
      // + проверить что пользователь существует
      break;
  }
}
```

---

## 9. Структура файлов

### Backend

```
backend/src/modules/
├── custom-fields/
│   ├── custom-fields.router.ts      — CRUD /api/admin/custom-fields
│   ├── custom-fields.service.ts
│   └── custom-fields.dto.ts
├── field-schemas/
│   ├── field-schemas.router.ts      — CRUD + copy + publish + set-default
│   ├── field-schemas.service.ts     — + copySchema(), publishSchema(), checkConflicts()
│   ├── field-schemas.conflicts.ts   — логика детектирования всех типов конфликтов
│   └── field-schemas.dto.ts
└── issues/
    ├── issues.router.ts             — + GET/PUT /api/issues/:id/custom-fields
    └── issues.service.ts            — + getApplicableFields(), upsertCustomFieldValues()
                                       + validateRequiredFieldsForDone()
```

### Frontend

```
frontend/src/
├── pages/admin/
│   ├── AdminCustomFieldsPage.tsx
│   ├── AdminFieldSchemasPage.tsx
│   └── AdminFieldSchemaDetailPage.tsx
├── components/
│   ├── CustomFieldInput.tsx            — универсальный input по fieldType
│   ├── IssueCustomFieldsSection.tsx    — секция в сайдбаре детали задачи
│   ├── KanbanCardCustomFields.tsx      — компактный вывод полей на Kanban-карточке
│   ├── RequiredFieldsBlockModal.tsx    — Modal с ошибкой незаполненных обязательных полей
│   ├── SchemaConflictsModal.tsx        — Modal конфликтов при публикации + кнопка экспорта
│   └── FieldSchemaBindingForm.tsx      — форма добавления привязки (Все проекты / Выбрать)
├── api/
│   ├── custom-fields.ts
│   └── field-schemas.ts
└── types/
    └── custom-fields.ts           — TypeScript-интерфейсы
```

---

## 10. Критерии приёмки

### 10.1 Управление полями (Admin)

- [ ] Администратор может создать поле с любым из 11 типов
- [ ] Для `SELECT`/`MULTI_SELECT` можно задать цветные варианты ответа
- [ ] Форма создания поля **не содержит** флага «Обязательное» (он задаётся в схеме)
- [ ] Нельзя изменить тип поля, если у него есть значения в задачах
- [ ] Нельзя удалить системное поле (`isSystem = true`)
- [ ] Перед удалением поля — явное подтверждение с указанием последствий
- [ ] Поле можно деактивировать: оно перестаёт отображаться в задачах (значения сохраняются)

### 10.2 Управление схемами (Admin)

- [ ] Новая схема создаётся в статусе **DRAFT**; она не влияет на отображение полей в задачах
- [ ] Кнопка «Сохранить и применить» переводит схему в **ACTIVE** (или показывает конфликты)
- [ ] При редактировании **ACTIVE** схемы — она автоматически возвращается в **DRAFT**
- [ ] Администратор может **скопировать** схему: создаётся DRAFT-копия с новым именем
- [ ] Опция «Копировать с привязками» — копирует и все биндинги (по умолчанию выключена)
- [ ] Ссылка «Скопировано из: &lt;имя&gt;» отображается на странице копии
- [ ] Порядок полей меняется drag-and-drop
- [ ] Для каждого поля в схеме задаётся флаг **«Обязательное»** — единственное место где настраивается обязательность
- [ ] Для каждого поля в схеме задаётся флаг **«На Kanban»** — показывать ли поле на Kanban-карточке
- [ ] Привязку можно создать комбинируя «Все проекты / Выбрать проекты» × «Все типы / Выбрать типы»; один диалог создаёт несколько биндингов
- [ ] Можно назначить одну ACTIVE схему «По умолчанию» (★)
- [ ] Удалить можно только DRAFT-схему; ACTIVE-схему нужно сначала деактивировать

### 10.2а Конфликты при публикации

- [ ] При нажатии «Сохранить и применить» backend проверяет конфликты с ACTIVE схемами
- [ ] Если есть **ERROR**-конфликты — схема НЕ публикуется, показывается Modal с конфликтами
- [ ] Если есть только **WARNING**-конфликты — Modal показывается, но есть кнопка «Опубликовать с предупреждениями»
- [ ] Если конфликтов нет — схема немедленно становится ACTIVE без Modal
- [ ] В Modal каждый конфликт содержит: название поля, название конфликтующей схемы, описание сути, область действия
- [ ] Кнопка **«Скачать конфликты .json»** — скачивает файл `conflicts-<schema>-<date>.json` с полным описанием
- [ ] Предварительная проверка конфликтов доступна без публикации через «Проверить конфликты» (опционально)

### 10.3 Карточка задачи (IssueDetailPage)

- [ ] Секция «Дополнительные поля» рендерится **только** если для задачи есть применимые схемы (если нет — секции нет)
- [ ] Поля отображаются в правильном порядке (по `orderIndex`)
- [ ] Каждый тип поля рендерится соответствующим UI-компонентом
- [ ] Значение можно редактировать inline (не покидая страницу)
- [ ] Изменение значения сохраняется немедленно (PUT запрос)
- [ ] Незаполненное обязательное поле помечено `*` красным
- [ ] При попытке перевести статус в `DONE` с незаполненными обязательными полями — показывается Modal с перечнем полей, статус НЕ меняется

### 10.4 Kanban-карточка (Board view)

- [ ] На Kanban-карточке отображаются кастомные поля с `showOnKanban = true`
- [ ] Показывается не более 3 полей на карточке
- [ ] Пустое обязательное поле на карточке помечено `⚠ Не заполнено`
- [ ] Данные кастомных полей загружаются в одном запросе со списком задач (`?includeKanbanFields=true`)

### 10.5 Форма создания задачи

- [ ] При создании задачи отображаются кастомные поля, применимые к выбранному типу и проекту
- [ ] Обязательные поля помечены `*`
- [ ] Введённые значения сохраняются вместе с задачей

### 10.6 Аудит

- [ ] Каждое изменение значения кастомного поля фиксируется в `AuditLog`
- [ ] В истории задачи (`GET /api/issues/:id/history`) отображаются изменения кастомных полей

---

## 11. Нефункциональные требования

- Запрос `GET /api/issues/:id/custom-fields` — не более 50 мс (p95), поля кэшируются в Redis (TTL 5 мин, инвалидация при изменении схемы)
- Схема биндингов кэшируется per-project+type с инвалидацией при изменении биндингов
- Поддержка до 100 кастомных полей в системе
- Поддержка до 50 полей в одной схеме
- JSONB хранение значений — без ограничений на размер (разумные: TEXT ≤ 10 000 символов, URL ≤ 2 000)

---

## 12. Ограничения MVP

- Кастомные поля **не** участвуют в фильтрации задач на доске и в списке (это `v2`)
- Экспорт/импорт схем полей — не в MVP
- Блокировка обязательных полей только при переходе в `DONE`; при `IN_PROGRESS` и `REVIEW` — только визуальная пометка

---

## 13. Зависимости

- Существующий модуль `issue-type-configs` — читать для списка типов задач при создании биндингов
- Существующий модуль `issue-type-schemes` — аналогичная архитектурная паттерн (M:M через scheme items + bindings)
- Существующие страницы Admin (паттерн UI): `AdminIssueTypeConfigsPage.tsx`, `AdminIssueTypeSchemesPage.tsx`
- Существующие миграции в `backend/src/prisma/migrations/`

---

## 14. Решения PO (закрытые вопросы)

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Что показывать если нет схемы? | Только системные поля задачи. Секция «Дополнительные поля» не рендерится. |
| 2 | Блокировать `DONE` или предупреждать? | **Блокировать.** 422 с явным перечнем незаполненных полей. |
| 3 | Поля на Kanban-карточке? | **Да, настраиваемо.** Флаг `showOnKanban` на каждом поле в схеме. Макс. 3 поля. |
| 4 | Фильтрация по кастомным полям? | Не делаем в `v1`. |
| 5 | Когда схема вступает в силу? | Только после явного «Сохранить и применить». До этого схема в DRAFT и не применяется. |
| 6 | Конфликты при публикации? | ERROR-конфликты блокируют публикацию. WARNING — не блокируют. Список конфликтов можно скачать в .json. |
| 7 | Копирование схем? | Да. Копия создаётся в DRAFT. Опционально — копировать биндинги. |
| 8 | Схема по умолчанию? | Одна ACTIVE схема может быть назначена по умолчанию (★). |
| 9 | «Для всех типов задач»? | В форме привязки — RadioGroup «Все типы / Выбрать типы». При выборе «Все типы» → `PROJECT` scope. |
| 10 | «Для всех проектов»? | В форме привязки — RadioGroup «Все проекты / Выбрать проекты». При выборе «Все проекты» → `GLOBAL` или `ISSUE_TYPE` scope. |

**Дополнительное уточнение от PO:** обязательность полей настраивается **только в схемах полей** (`FieldSchemaItem.isRequired`). На уровне `CustomField` флага `isRequired` нет.
