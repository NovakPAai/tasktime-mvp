-- Normalize all existing emails to lowercase for case-insensitive login
UPDATE "users" SET "email" = LOWER("email") WHERE "email" != LOWER("email");
