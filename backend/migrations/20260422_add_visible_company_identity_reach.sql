-- Buyer visibility for Product Profile company blocks (detail view).
ALTER TABLE vendor_self_attestations
  ADD COLUMN IF NOT EXISTS visible_company_identity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_company_reach boolean NOT NULL DEFAULT false;
