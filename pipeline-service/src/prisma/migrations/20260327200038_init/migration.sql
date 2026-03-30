-- CreateEnum
CREATE TYPE "PipelineSource" AS ENUM ('GITHUB', 'GITLAB');

-- CreateEnum
CREATE TYPE "PullRequestCiStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PullRequestReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "StagingBatchState" AS ENUM ('COLLECTING', 'MERGING', 'DEPLOYING', 'TESTING', 'PASSED', 'FAILED', 'RELEASED');

-- CreateEnum
CREATE TYPE "DeployTarget" AS ENUM ('STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "DeployEventStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "pull_request_snapshots" (
    "id" TEXT NOT NULL,
    "external_id" INTEGER NOT NULL,
    "source" "PipelineSource" NOT NULL DEFAULT 'GITHUB',
    "repo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "base_branch" TEXT NOT NULL,
    "has_conflicts" BOOLEAN NOT NULL DEFAULT false,
    "ci_status" "PullRequestCiStatus" NOT NULL DEFAULT 'PENDING',
    "ci_message" TEXT,
    "review_status" "PullRequestReviewStatus" NOT NULL DEFAULT 'PENDING',
    "html_url" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB,
    "linked_issue_ids" TEXT[],
    "merge_queue_position" INTEGER,
    "merged_at" TIMESTAMP(3),
    "merged_sha" TEXT,
    "staging_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pull_request_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "StagingBatchState" NOT NULL DEFAULT 'COLLECTING',
    "release_id" TEXT,
    "release_name" TEXT,
    "created_by_id" TEXT NOT NULL,
    "notes" TEXT,
    "health_check_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploy_events" (
    "id" TEXT NOT NULL,
    "target" "DeployTarget" NOT NULL,
    "status" "DeployEventStatus" NOT NULL DEFAULT 'PENDING',
    "image_tag" TEXT NOT NULL,
    "git_sha" TEXT,
    "triggered_by_id" TEXT NOT NULL,
    "staging_batch_id" TEXT,
    "release_id" TEXT,
    "workflow_run_id" INTEGER,
    "workflow_run_url" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "health_check_result" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deploy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_states" (
    "id" TEXT NOT NULL,
    "sync_type" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "sync_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pull_request_snapshots_staging_batch_id_idx" ON "pull_request_snapshots"("staging_batch_id");

-- CreateIndex
CREATE INDEX "pull_request_snapshots_ci_status_idx" ON "pull_request_snapshots"("ci_status");

-- CreateIndex
CREATE UNIQUE INDEX "pull_request_snapshots_source_repo_external_id_key" ON "pull_request_snapshots"("source", "repo", "external_id");

-- CreateIndex
CREATE INDEX "staging_batches_state_idx" ON "staging_batches"("state");

-- CreateIndex
CREATE INDEX "deploy_events_target_status_idx" ON "deploy_events"("target", "status");

-- CreateIndex
CREATE INDEX "deploy_events_staging_batch_id_idx" ON "deploy_events"("staging_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_sync_type_key" ON "sync_states"("sync_type");

-- AddForeignKey
ALTER TABLE "pull_request_snapshots" ADD CONSTRAINT "pull_request_snapshots_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_events" ADD CONSTRAINT "deploy_events_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
