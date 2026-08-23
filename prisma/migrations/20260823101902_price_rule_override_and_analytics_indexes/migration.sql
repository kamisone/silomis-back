-- AlterEnum
ALTER TYPE "PriceRuleType" ADD VALUE 'override';

-- DropIndex
DROP INDEX "shop_replay_events_sessionId_idx";

-- CreateIndex
CREATE INDEX "shop_behavior_events_cartToken_idx" ON "shop_behavior_events"("cartToken");

-- CreateIndex
CREATE INDEX "shop_behavior_events_shopCustomerId_idx" ON "shop_behavior_events"("shopCustomerId");

-- CreateIndex
CREATE INDEX "shop_behavior_events_countryCode_idx" ON "shop_behavior_events"("countryCode");

-- CreateIndex
CREATE INDEX "shop_replay_events_sessionId_timestampMs_idx" ON "shop_replay_events"("sessionId", "timestampMs");

-- CreateIndex
CREATE INDEX "shop_replay_sessions_startedAt_idx" ON "shop_replay_sessions"("startedAt");
