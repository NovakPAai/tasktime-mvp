-- AlterTable
ALTER TABLE "issues" ADD COLUMN "due_date" DATE;

-- CreateIndex
CREATE INDEX "issues_due_date_idx" ON "issues"("due_date");
