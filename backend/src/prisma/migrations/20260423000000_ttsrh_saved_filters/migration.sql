-- TTSRH-1 PR-1: Saved filters foundation (TTS-QL)

-- User.preferences — JSON column for per-user UI defaults (search columns, page size, etc.)
ALTER TABLE "users" ADD COLUMN "preferences" JSONB;

-- Enums
CREATE TYPE "FilterVisibility" AS ENUM ('PRIVATE', 'SHARED', 'PUBLIC');
CREATE TYPE "FilterPermission" AS ENUM ('READ', 'WRITE');

-- saved_filters
CREATE TABLE "saved_filters" (
    "id"           TEXT NOT NULL,
    "owner_id"     TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "jql"          TEXT NOT NULL,
    "visibility"   "FilterVisibility" NOT NULL DEFAULT 'PRIVATE',
    "columns"      JSONB,
    "is_favorite"  BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMP(3),
    "use_count"    INTEGER NOT NULL DEFAULT 0,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_filters_owner_id_idx" ON "saved_filters"("owner_id");
CREATE INDEX "saved_filters_visibility_idx" ON "saved_filters"("visibility");

ALTER TABLE "saved_filters"
    ADD CONSTRAINT "saved_filters_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- saved_filter_shares
CREATE TABLE "saved_filter_shares" (
    "id"         TEXT NOT NULL,
    "filter_id"  TEXT NOT NULL,
    "user_id"    TEXT,
    "group_id"   TEXT,
    "permission" "FilterPermission" NOT NULL DEFAULT 'READ',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_filter_shares_pkey" PRIMARY KEY ("id"),
    -- XOR: exactly one of user_id / group_id must be set. Prisma cannot express this
    -- declaratively, so we enforce it at the DB level.
    CONSTRAINT "saved_filter_shares_user_or_group_chk"
        CHECK (("user_id" IS NOT NULL) <> ("group_id" IS NOT NULL))
);

CREATE INDEX "saved_filter_shares_filter_id_idx" ON "saved_filter_shares"("filter_id");
CREATE INDEX "saved_filter_shares_user_id_idx" ON "saved_filter_shares"("user_id");
CREATE INDEX "saved_filter_shares_group_id_idx" ON "saved_filter_shares"("group_id");

-- Business uniqueness: one share row per (filter, subject). Partial unique indexes
-- because user_id / group_id are nullable (XOR enforced by the CHECK above).
CREATE UNIQUE INDEX "saved_filter_shares_filter_id_user_id_key"
    ON "saved_filter_shares"("filter_id", "user_id")
    WHERE "group_id" IS NULL;
CREATE UNIQUE INDEX "saved_filter_shares_filter_id_group_id_key"
    ON "saved_filter_shares"("filter_id", "group_id")
    WHERE "user_id" IS NULL;

ALTER TABLE "saved_filter_shares"
    ADD CONSTRAINT "saved_filter_shares_filter_id_fkey"
    FOREIGN KEY ("filter_id") REFERENCES "saved_filters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_filter_shares"
    ADD CONSTRAINT "saved_filter_shares_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_filter_shares"
    ADD CONSTRAINT "saved_filter_shares_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
