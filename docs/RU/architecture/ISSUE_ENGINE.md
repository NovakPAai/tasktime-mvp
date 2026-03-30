# Flow Universe — Проектирование движка задач (Issue)

**Назначение:** Проектирование ядра системы задач: жизненный цикл, переходы статусов, колонки доски, назначение на спринт, история.  
**Дата:** март 2025

---

## 1. Жизненный цикл задачи (MVP)

**Issue** — единица работы. Имеет: идентичность (id, project_id, опционально parent_id); тип (epic/story/task/subtask); состояние (статус, исполнитель, создатель, опционально sprint_id); контент (title, description, acceptance_criteria, story_points, estimated_hours); метаданные (created_at, updated_at).

**Жизненный цикл:** 1) Создана — в бэклоге (sprint_id = null) или сразу в спринте; статус = первая колонка (например Open / To Do). 2) В работе — статус проходит по колонкам доски (In Progress, In Review). 3) Готово или отменено — терминальные состояния. Отменено — явная отмена (исключение с доски или отдельная колонка). Мягкого «архива» в MVP нет; «cancelled» — терминальное отрицательное состояние.

---

## 2. Статус и переходы

**Модель статуса (MVP):** Фиксированный набор: open | in_progress | in_review | done | cancelled. Хранится строкой в Issue. Один набор для всех проектов.

**Допустимые переходы:** Любой не терминальный → любой не терминальный; любой → cancelled (при необходимости запретить done → cancelled или разрешить reopen из cancelled — зафиксировать в API).

**Кто меняет:** Пользователь с правом редактирования задачи (исполнитель, автор или admin/manager). API: PATCH /api/issues/:id с { status } или отдельный PATCH /api/issues/:id/status.

---

## 3. Колонки доски

Доска имеет упорядоченный список BoardColumns. У колонки: status_key (например open, in_progress, …), order_index, опционально wip_limit. Задачи группируются по issue.status === column.status_key. Порядок внутри колонки — по issue.order_index (или created_at). Дефолтная доска в MVP: одна на проект; колонки из фиксированного набора статусов. Cancelled — отдельная колонка или скрыта с основной доски.

---

## 4. Назначение на спринт

Спринт: project_id, name, start_date, end_date, state (open | active | closed). У задачи опционально sprint_id. sprint_id = null — задача в бэклоге. Правила: назначение на спринт — установка issue.sprint_id; в бэклог — null. Только задачи того же проекта. При закрытии спринта политика переноса невыполненных задач в бэклог — опционально; в MVP можно не делать автоматический перенос.

---

## 5. Порядок задач

Поле order_index (целое) у Issue. Ниже значение — выше в списке (или наоборот; зафиксировать единообразно). Область: по (project_id, sprint_id, status) или по (project_id, parent_id). API: PATCH /api/issues/reorder с телом { issue_ids: [3,1,2] } или по колонке { status, issue_ids }. Сервис обновляет order_index в одной транзакции.

---

## 6. История задачи

**Вариант A (рекомендация для MVP):** Использовать только audit_log. Действия issue.status_changed, issue.assignee_changed с details = { field, old_value, new_value }. Отдельной таблицы issue_history нет; выборка по entity_type = 'issue', entity_id = id. Эндпоинт GET /api/issues/:id/history читает из audit_log.

**Вариант B:** Отдельная таблица issue_history (issue_id, field_name, old_value, new_value, user_id, created_at) — для богатого UI истории по полям; вводить при необходимости позже.

---

## 7. Сводка API (по задачам)

Список по проекту, бэклог, одна задача, создание, обновление, смена статуса, переупорядочивание, удаление, история — см. таблицу в docs/ENG/architecture/ISSUE_ENGINE.md.

Итог: жизненный цикл от создания до Done/Cancelled; фиксированный набор статусов и переходов; колонки доски по status_key; спринт через sprint_id; порядок через order_index и reorder API; история через audit_log с действиями issue.*.
