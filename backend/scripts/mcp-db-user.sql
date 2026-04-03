-- =============================================================================
-- FlowUniverse MCP — техническая учётная запись PostgreSQL
-- =============================================================================
-- Запуск: psql -U postgres -d tasktime -f mcp-db-user.sql
--
-- Принцип: минимальные привилегии для работы 14 MCP-инструментов.
-- Агент может читать всё, писать только в рабочие таблицы,
-- удалять и менять структуру — запрещено.
-- =============================================================================

-- 1. Создать пользователя (заменить пароль перед запуском)
CREATE USER "flowuniverse_mcp" WITH
  PASSWORD 'CHANGE_ME_STRONG_PASSWORD'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  LOGIN
  CONNECTION LIMIT 5;

COMMENT ON ROLE "flowuniverse_mcp" IS 'FlowUniverse MCP — техническая УЗ для AI-агента. Только рабочие операции, без DDL и DELETE.';

-- 2. Подключение к базе
GRANT CONNECT ON DATABASE tasktime TO "flowuniverse_mcp";
GRANT USAGE ON SCHEMA public TO "flowuniverse_mcp";

-- =============================================================================
-- 3. SELECT — читать всё (агенту нужен полный контекст)
-- =============================================================================
GRANT SELECT ON
  users,
  projects,
  issues,
  sprints,
  releases,
  comments,
  time_logs,
  ai_sessions,
  audit_logs,
  issue_type_configs,
  issue_type_schemes,
  issue_type_scheme_items,
  issue_type_scheme_projects,
  issue_links,
  issue_link_types,
  issue_custom_field_values,
  custom_fields,
  field_schemas,
  field_schema_items,
  field_schema_bindings,
  teams,
  team_members,
  user_project_roles,
  project_categories,
  workflow_statuses,
  workflows,
  workflow_steps,
  workflow_transitions,
  workflow_schemes,
  workflow_scheme_items,
  workflow_scheme_projects,
  transition_screens,
  transition_screen_items,
  system_settings
TO "flowuniverse_mcp";

-- =============================================================================
-- 4. INSERT — создавать новые записи
--    (подзадачи, комментарии, логи времени, AI-сессии, audit)
-- =============================================================================
GRANT INSERT ON
  issues,        -- create_subtask
  comments,      -- add_comment, complete_issue, fail_issue
  time_logs,     -- log_time, register_ai_session
  ai_sessions,   -- register_ai_session
  audit_logs     -- claim_issue, complete_issue, fail_issue, update_status
TO "flowuniverse_mcp";

-- =============================================================================
-- 5. UPDATE — только поля задач (статус, AI-флаги)
--    НЕ users, НЕ projects, НЕ system_settings
-- =============================================================================
GRANT UPDATE ON
  issues         -- update_status, claim_issue, complete_issue, fail_issue
TO "flowuniverse_mcp";

-- =============================================================================
-- 6. Sequences — нужны для INSERT с auto-increment
-- =============================================================================
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "flowuniverse_mcp";

-- =============================================================================
-- 7. Явно запрещаем опасные операции (defence-in-depth)
--    DELETE и DDL не выдавались — но явный REVOKE защищает от случайного
--    наследования через роли.
-- =============================================================================
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM "flowuniverse_mcp";
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM "flowuniverse_mcp";

-- Запрет на изменение структуры БД (DDL) — superuser-только, но для ясности:
-- ALTER, DROP, CREATE — не выдавались и не будут.

-- =============================================================================
-- 8. Проверка (запустить после создания пользователя)
-- =============================================================================
-- \c tasktime flowuniverse_mcp
-- SELECT id, email FROM users LIMIT 1;           -- должно работать
-- UPDATE users SET name='x' WHERE false;         -- должно упасть с ошибкой прав
-- DELETE FROM issues WHERE false;                -- должно упасть с ошибкой прав
-- DROP TABLE issues;                             -- должно упасть с ошибкой прав
