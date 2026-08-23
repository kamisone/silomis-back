-- Sequences backing human-readable document numbers (INV-2026-000001, REC-2026-000001).
-- Not modeled in schema.prisma — Prisma has no native sequence primitive, and
-- DocumentService reads these via `SELECT nextval(...)` raw SQL.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS shop_receipt_seq;
