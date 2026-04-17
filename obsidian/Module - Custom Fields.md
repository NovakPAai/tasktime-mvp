---
tags: [module, custom-fields, admin]
---

# Module — Custom Fields

Path: `backend/src/modules/custom-fields/`, `backend/src/modules/issue-custom-fields/`

## Роуты

| Method | Path | Описание |
|--------|------|---------|
| GET | `/custom-fields` | Список полей |
| POST | `/custom-fields` | Создать поле |
| PATCH | `/custom-fields/:id` | Обновить |
| DELETE | `/custom-fields/:id` | Удалить |
| PATCH | `/custom-fields/:id/toggle` | Вкл/выкл поле |
| PATCH | `/custom-fields/reorder` | Переупорядочить |
| GET | `/issues/:id/custom-fields` | Значения полей задачи |
| PUT | `/issues/:id/custom-fields/:fieldId` | Установить значение |

## Типы полей

| Тип | Описание |
|-----|---------|
| `TEXT` | Строка |
| `TEXTAREA` | Многострочный текст |
| `NUMBER` | Целое число |
| `DECIMAL` | Дробное число |
| `DATE` | Дата |
| `DATETIME` | Дата + время |
| `URL` | Ссылка |
| `CHECKBOX` | Булево |
| `SELECT` | Выбор одного из списка |
| `MULTI_SELECT` | Множественный выбор |
| `USER` | Ссылка на пользователя |
| `LABEL` | Тег |
| `REFERENCE` | Ссылка на другую задачу |

## Связи

- [[Module - Field Schemas]] — схемы определяют видимость полей
- [[Module - Workflows]] — поля на экранах переходов (TransitionScreen)
- [[Database Schema]] — CustomField, IssueCustomFieldValue
- [[Frontend - Pages]] — `AdminCustomFieldsPage`
