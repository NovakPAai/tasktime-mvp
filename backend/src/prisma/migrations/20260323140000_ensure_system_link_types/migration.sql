-- Idempotent re-seed: insert system link types if they are missing.
-- ON CONFLICT (name) DO NOTHING ensures this is safe to run on any server,
-- regardless of whether the original seed in 20260317120000 succeeded or not.
INSERT INTO "issue_link_types" ("id", "name", "outbound_name", "inbound_name", "is_active", "is_system", "created_at", "updated_at") VALUES
    (gen_random_uuid(), 'Блокирует',  'Блокирует',  'Заблокировано',       true, true, NOW(), NOW()),
    (gen_random_uuid(), 'Связана с',  'Связана с',  'Связана с',           true, true, NOW(), NOW()),
    (gen_random_uuid(), 'Дублирует',  'Дублирует',  'Является дубликатом', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'Зависит от', 'Зависит от', 'Требуется для',       true, true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
