-- TTBUS-0.1: transactional outbox and consumer deduplication tables.

CREATE TABLE "event_outbox" (
  "id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "envelope" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,

  CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_messages" (
  "consumer_group" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("consumer_group", "message_id")
);

CREATE UNIQUE INDEX "event_outbox_message_id_key" ON "event_outbox"("message_id");
CREATE INDEX "event_outbox_sent_at_created_at_idx" ON "event_outbox"("sent_at", "created_at");
CREATE INDEX "event_outbox_message_id_idx" ON "event_outbox"("message_id");
CREATE INDEX "processed_messages_processed_at_idx" ON "processed_messages"("processed_at");
