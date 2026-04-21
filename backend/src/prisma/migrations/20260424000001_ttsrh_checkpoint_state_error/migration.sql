-- TTSRH-1 PR-16: Add ERROR to CheckpointState enum for TTQL compile/runtime
-- failure path (R16, FR-31). Existing rows unchanged; only new code emits ERROR.

ALTER TYPE "CheckpointState" ADD VALUE IF NOT EXISTS 'ERROR';
