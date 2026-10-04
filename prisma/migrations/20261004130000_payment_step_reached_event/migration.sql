-- "Reached checkout" for live products: written when a draft order moves to
-- awaiting_payment. Test orders are refused before that point and keep
-- writing test_checkout_blocked instead.
ALTER TYPE "BehaviorEventType" ADD VALUE 'payment_step_reached';
