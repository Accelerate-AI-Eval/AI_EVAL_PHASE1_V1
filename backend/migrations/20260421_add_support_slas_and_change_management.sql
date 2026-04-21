-- Vendor self attestation: Operations & Reliability additions
ALTER TABLE vendor_self_attestations
  ADD COLUMN IF NOT EXISTS support_slas TEXT,
  ADD COLUMN IF NOT EXISTS change_management TEXT;
