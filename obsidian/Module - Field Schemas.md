---
tags: [module, field-schemas, admin]
---

# Module — Field Schemas

Path: `backend/src/modules/field-schemas/`

## Роуты (`/api/admin/field-schemas`)

| Method | Path | Описание |
|--------|------|---------|
| GET/POST | `/admin/field-schemas` | Список / создать схему |
| PATCH/DELETE | `/admin/field-schemas/:id` | Обновить / удалить |
| PUT | `/admin/field-schemas/:id/items` | Заменить список полей |
| GET | `/admin/field-schemas/:id/bindings` | Привязки схемы |
| POST | `/admin/field-schemas/:id/bindings` | Создать привязку |
| DELETE | `/admin/field-schemas/:id/bindings/:bindingId` | Удалить привязку |

## Структура

```
FieldSchema
  ├── status: DRAFT | ACTIVE
  ├── isDefault
  ├── FieldSchemaItem[] → CustomField (orderIndex, isRequired, showOnKanban)
  └── FieldSchemaBinding[]
        └── scopeType: GLOBAL | PROJECT | ISSUE_TYPE | PROJECT_ISSUE_TYPE
```

## Как резолвится схема для задачи

```
Issue(projectId, issueTypeId)
  → FieldSchemaBinding с наиболее специфичным scope:
     PROJECT_ISSUE_TYPE > PROJECT > ISSUE_TYPE > GLOBAL
  → вернуть FieldSchemaItem[] (видимые поля + порядок)
```

## Связи

- [[Module - Custom Fields]] — поля, включённые в схему
- [[Module - Issues]] — резолвинг при загрузке задачи
- [[Frontend - Pages]] — `AdminFieldSchemasPage`, `AdminFieldSchemaDetailPage`
