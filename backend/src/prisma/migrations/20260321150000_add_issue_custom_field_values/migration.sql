-- CreateTable
CREATE TABLE "issue_custom_field_values" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "custom_field_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT NOT NULL,

    CONSTRAINT "issue_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_custom_field_values_issue_id_idx" ON "issue_custom_field_values"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_custom_field_values_issue_id_custom_field_id_key"
    ON "issue_custom_field_values"("issue_id", "custom_field_id");

-- AddForeignKey
ALTER TABLE "issue_custom_field_values" ADD CONSTRAINT "issue_custom_field_values_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_custom_field_values" ADD CONSTRAINT "issue_custom_field_values_custom_field_id_fkey"
    FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_custom_field_values" ADD CONSTRAINT "issue_custom_field_values_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
