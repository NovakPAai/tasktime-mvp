-- TTSRH-1 PR-15: Checkpoint TTQL foundation.
-- Adds conditionMode + ttqlCondition to CheckpointType and ttqlSnapshot +
-- conditionModeSnapshot to ReleaseCheckpoint. All existing rows are backfilled
-- to `STRUCTURED` (FR-25 backward-compat): existing КТ continue to evaluate via
-- the structured criteria[] path unchanged.
--
-- Идемпотентна: повторный `prisma migrate deploy` — no-op.

-- Enum
CREATE TYPE "CheckpointConditionMode" AS ENUM ('STRUCTURED', 'TTQL', 'COMBINED');

-- CheckpointType
ALTER TABLE "checkpoint_types"
    ADD COLUMN "condition_mode" "CheckpointConditionMode" NOT NULL DEFAULT 'STRUCTURED',
    ADD COLUMN "ttql_condition" TEXT;

-- Existing rows already have DEFAULT 'STRUCTURED' from the column-add; no explicit
-- backfill required. ttql_condition stays NULL for STRUCTURED — validated at
-- application level (checkpoint.dto.ts superRefine).

-- ReleaseCheckpoint
ALTER TABLE "release_checkpoints"
    ADD COLUMN "ttql_snapshot" TEXT,
    ADD COLUMN "condition_mode_snapshot" "CheckpointConditionMode" NOT NULL DEFAULT 'STRUCTURED';
