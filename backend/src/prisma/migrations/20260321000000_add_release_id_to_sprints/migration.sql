-- AddColumn: release_id to sprints
ALTER TABLE "sprints" ADD COLUMN "release_id" TEXT REFERENCES "releases"("id") ON DELETE SET NULL;

-- AddIndex
CREATE INDEX "sprints_release_id_idx" ON "sprints"("release_id");
