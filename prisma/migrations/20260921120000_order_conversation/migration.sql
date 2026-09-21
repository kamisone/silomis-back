-- Order-scoped support conversations.
--
-- Existing rows are all the storefront widget's, so `general` is the right
-- default and no backfill is needed.

CREATE TYPE "SupportConversationKind" AS ENUM ('general', 'order');

ALTER TABLE "support_conversations"
  ADD COLUMN "kind" "SupportConversationKind" NOT NULL DEFAULT 'general',
  ADD COLUMN "orderId" TEXT;

-- One thread per order: the customer and the shop always land in the same
-- place however they reached it.
CREATE UNIQUE INDEX "support_conversations_orderId_key"
  ON "support_conversations"("orderId");

-- Drives the admin inbox's "order threads" filter.
CREATE INDEX "support_conversations_kind_lastMessageAt_idx"
  ON "support_conversations"("kind", "lastMessageAt");

ALTER TABLE "support_conversations"
  ADD CONSTRAINT "support_conversations_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
