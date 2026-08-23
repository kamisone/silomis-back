/*
  Warnings:

  - Made the column `lastEventAt` on table `shop_replay_sessions` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill existing rows written before lastEventAt was required — mirrors
-- the reference schema's invariant that it always starts equal to startedAt.
UPDATE "shop_replay_sessions" SET "lastEventAt" = "startedAt" WHERE "lastEventAt" IS NULL;

-- AlterTable
ALTER TABLE "shop_replay_sessions" ALTER COLUMN "lastEventAt" SET NOT NULL,
ALTER COLUMN "lastEventAt" SET DEFAULT CURRENT_TIMESTAMP;
