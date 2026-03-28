-- CreateEnum
CREATE TYPE "BatchState" AS ENUM ('COLLECTING', 'DEPLOYING', 'TESTING', 'PASSED', 'FAILED', 'RELEASED');

-- CreateEnum
CREATE TYPE "CiStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DeployStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILURE', 'CANCELLED');

-- CreateTable
CREATE TABLE "staging_batches" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" "BatchState" NOT NULL DEFAULT 'COLLECTING',
    "repo" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "notes" TEXT,
    "stagingUrl" TEXT,
    "prodSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_snapshots" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "ciStatus" "CiStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "pr_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploy_events" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "env" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" "DeployStatus" NOT NULL DEFAULT 'RUNNING',
    "durationMs" INTEGER,
    "logUrl" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deploy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_states" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastPrNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_repo_key" ON "sync_states"("repo");

-- AddForeignKey
ALTER TABLE "pr_snapshots" ADD CONSTRAINT "pr_snapshots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "staging_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_events" ADD CONSTRAINT "deploy_events_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "staging_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
