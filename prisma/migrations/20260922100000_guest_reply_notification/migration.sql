-- The customer now gets an email when the shop replies on their order, and
-- that needs its own debounce clock. Reusing `lastNotifiedAt` would have let
-- the shop's own reply suppress the next alert about a customer still waiting
-- for an answer — the two directions are unrelated.

ALTER TABLE "support_conversations"
  ADD COLUMN "lastGuestNotifiedAt" TIMESTAMP(3);
