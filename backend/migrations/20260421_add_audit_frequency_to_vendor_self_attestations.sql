-- Vendor self attestation: audit frequency (Compliance & Certifications)
ALTER TABLE vendor_self_attestations
  ADD COLUMN IF NOT EXISTS audit_frequency VARCHAR(100);
