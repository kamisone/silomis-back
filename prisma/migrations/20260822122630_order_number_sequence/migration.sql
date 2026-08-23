-- Sequence backing human-readable order numbers (ORD-000001). Not modeled in
-- schema.prisma — OrdersService/CheckoutService read it via `SELECT nextval(...)`.
CREATE SEQUENCE IF NOT EXISTS shop_order_number_seq;
