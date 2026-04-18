-- TTMP-160 PR-1: Release Checkpoints foundation (types, templates, release-checkpoints, violation events, burndown snapshots)

-- Enums
CREATE TYPE "CheckpointWeight" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "CheckpointState"  AS ENUM ('PENDING', 'OK', 'VIOLATED');

-- checkpoint_types
CREATE TABLE "checkpoint_types" (
    "id"                 TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "description"        TEXT,
    "color"              TEXT NOT NULL DEFAULT '#888888',
    "weight"             "CheckpointWeight" NOT NULL DEFAULT 'MEDIUM',
    "offset_days"        INTEGER NOT NULL,
    "warning_days"       INTEGER NOT NULL DEFAULT 3,
    "criteria"           JSONB NOT NULL,
    "webhook_url"        TEXT,
    "min_stable_seconds" INTEGER NOT NULL DEFAULT 300,
    "is_active"          BOOLEAN NOT NULL DEFAULT true,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoint_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkpoint_types_name_key" ON "checkpoint_types"("name");
CREATE INDEX "checkpoint_types_is_active_idx" ON "checkpoint_types"("is_active");

-- checkpoint_templates
CREATE TABLE "checkpoint_templates" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "created_by_id" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoint_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkpoint_templates_name_key" ON "checkpoint_templates"("name");

ALTER TABLE "checkpoint_templates"
    ADD CONSTRAINT "checkpoint_templates_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- checkpoint_template_items
CREATE TABLE "checkpoint_template_items" (
    "id"                  TEXT NOT NULL,
    "template_id"         TEXT NOT NULL,
    "checkpoint_type_id"  TEXT NOT NULL,
    "order_index"         INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checkpoint_template_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkpoint_template_items_template_id_checkpoint_type_id_key"
    ON "checkpoint_template_items"("template_id", "checkpoint_type_id");
CREATE INDEX "checkpoint_template_items_template_id_idx"
    ON "checkpoint_template_items"("template_id");

ALTER TABLE "checkpoint_template_items"
    ADD CONSTRAINT "checkpoint_template_items_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "checkpoint_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkpoint_template_items"
    ADD CONSTRAINT "checkpoint_template_items_checkpoint_type_id_fkey"
    FOREIGN KEY ("checkpoint_type_id") REFERENCES "checkpoint_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- release_checkpoints
CREATE TABLE "release_checkpoints" (
    "id"                   TEXT NOT NULL,
    "release_id"           TEXT NOT NULL,
    "checkpoint_type_id"   TEXT NOT NULL,
    "criteria_snapshot"    JSONB NOT NULL,
    "offset_days_snapshot" INTEGER NOT NULL,
    "deadline"             DATE NOT NULL,
    "state"                "CheckpointState" NOT NULL DEFAULT 'PENDING',
    "last_evaluated_at"    TIMESTAMP(3),
    "applicable_issue_ids" JSONB NOT NULL DEFAULT '[]',
    "passed_issue_ids"     JSONB NOT NULL DEFAULT '[]',
    "violations"           JSONB NOT NULL DEFAULT '[]',
    "violations_hash"      TEXT NOT NULL DEFAULT '',
    "last_webhook_sent_at" TIMESTAMP(3),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_checkpoints_release_id_checkpoint_type_id_key"
    ON "release_checkpoints"("release_id", "checkpoint_type_id");
CREATE INDEX "release_checkpoints_release_id_idx" ON "release_checkpoints"("release_id");
CREATE INDEX "release_checkpoints_deadline_idx" ON "release_checkpoints"("deadline");
CREATE INDEX "release_checkpoints_state_idx" ON "release_checkpoints"("state");

ALTER TABLE "release_checkpoints"
    ADD CONSTRAINT "release_checkpoints_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_checkpoints"
    ADD CONSTRAINT "release_checkpoints_checkpoint_type_id_fkey"
    FOREIGN KEY ("checkpoint_type_id") REFERENCES "checkpoint_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- checkpoint_violation_events
CREATE TABLE "checkpoint_violation_events" (
    "id"                    TEXT NOT NULL,
    "release_checkpoint_id" TEXT NOT NULL,
    "issue_id"              TEXT NOT NULL,
    "issue_key"             TEXT NOT NULL,
    "reason"                TEXT NOT NULL,
    "criterion_type"        TEXT NOT NULL,
    "occurred_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at"           TIMESTAMP(3),

    CONSTRAINT "checkpoint_violation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkpoint_violation_events_release_checkpoint_id_idx"
    ON "checkpoint_violation_events"("release_checkpoint_id");
CREATE INDEX "checkpoint_violation_events_issue_id_idx"
    ON "checkpoint_violation_events"("issue_id");
CREATE INDEX "checkpoint_violation_events_occurred_at_idx"
    ON "checkpoint_violation_events"("occurred_at");
CREATE INDEX "checkpoint_violation_events_resolved_at_idx"
    ON "checkpoint_violation_events"("resolved_at");

ALTER TABLE "checkpoint_violation_events"
    ADD CONSTRAINT "checkpoint_violation_events_release_checkpoint_id_fkey"
    FOREIGN KEY ("release_checkpoint_id") REFERENCES "release_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- release_burndown_snapshots
CREATE TABLE "release_burndown_snapshots" (
    "id"                    TEXT NOT NULL,
    "release_id"            TEXT NOT NULL,
    "snapshot_date"         DATE NOT NULL,
    "total_issues"          INTEGER NOT NULL,
    "done_issues"           INTEGER NOT NULL,
    "open_issues"           INTEGER NOT NULL,
    "cancelled_issues"      INTEGER NOT NULL,
    "total_estimated_hours" DECIMAL(8,2) NOT NULL,
    "done_estimated_hours"  DECIMAL(8,2) NOT NULL,
    "open_estimated_hours"  DECIMAL(8,2) NOT NULL,
    "violated_checkpoints"  INTEGER NOT NULL DEFAULT 0,
    "total_checkpoints"     INTEGER NOT NULL DEFAULT 0,
    "captured_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_burndown_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_burndown_snapshots_release_id_snapshot_date_key"
    ON "release_burndown_snapshots"("release_id", "snapshot_date");
CREATE INDEX "release_burndown_snapshots_release_id_idx"
    ON "release_burndown_snapshots"("release_id");
CREATE INDEX "release_burndown_snapshots_snapshot_date_idx"
    ON "release_burndown_snapshots"("snapshot_date");

ALTER TABLE "release_burndown_snapshots"
    ADD CONSTRAINT "release_burndown_snapshots_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
