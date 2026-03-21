-- AlterTable
ALTER TABLE "sprints" ADD COLUMN "release_id" TEXT;

-- CreateIndex
CREATE INDEX "sprints_release_id_idx" ON "sprints"("release_id");

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
