-- CreateTable: IssueLinkType (справочник видов связей)
CREATE TABLE "issue_link_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outbound_name" TEXT NOT NULL,
    "inbound_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_link_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique name
CREATE UNIQUE INDEX "issue_link_types_name_key" ON "issue_link_types"("name");

-- CreateTable: IssueLink (конкретные связи между задачами)
CREATE TABLE "issue_links" (
    "id" TEXT NOT NULL,
    "source_issue_id" TEXT NOT NULL,
    "target_issue_id" TEXT NOT NULL,
    "link_type_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: no duplicate links of same type between same pair
CREATE UNIQUE INDEX "issue_links_source_issue_id_target_issue_id_link_type_id_key"
    ON "issue_links"("source_issue_id", "target_issue_id", "link_type_id");

-- CreateIndex
CREATE INDEX "issue_links_source_issue_id_idx" ON "issue_links"("source_issue_id");

-- CreateIndex
CREATE INDEX "issue_links_target_issue_id_idx" ON "issue_links"("target_issue_id");

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_source_issue_id_fkey"
    FOREIGN KEY ("source_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_target_issue_id_fkey"
    FOREIGN KEY ("target_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_link_type_id_fkey"
    FOREIGN KEY ("link_type_id") REFERENCES "issue_link_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: системные типы связей по умолчанию
INSERT INTO "issue_link_types" ("id", "name", "outbound_name", "inbound_name", "is_active", "is_system", "created_at", "updated_at") VALUES
    (gen_random_uuid(), 'Блокирует',   'блокирует',    'заблокировано',    true, true, NOW(), NOW()),
    (gen_random_uuid(), 'Связана с',   'связана с',    'связана с',        true, true, NOW(), NOW()),
    (gen_random_uuid(), 'Дублирует',   'дублирует',    'является дубликатом', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'Зависит от',  'зависит от',   'требуется для',    true, true, NOW(), NOW());
