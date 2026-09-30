-- A home-page band for the send-in service.
--
-- The service was reachable only from a link in the header, styled like the
-- lowest-intent destination on the site. It needs three sentences to land — you
-- keep your own cap, you design on a photo of it, it comes back stitched — and
-- the home page is the only place there is room for them.
--
-- `IF NOT EXISTS` because adding an enum value is not transactional in older
-- Postgres and a half-applied migration file must be safe to re-run.
ALTER TYPE "HomeSectionType" ADD VALUE IF NOT EXISTS 'send_in_band';
