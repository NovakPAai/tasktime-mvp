-- AlterTable
ALTER TABLE "transition_screen_items" ADD COLUMN "system_field_key" TEXT,
ALTER COLUMN "custom_field_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "transition_screen_items_screen_id_system_field_key_key" ON "transition_screen_items"("screen_id", "system_field_key");
