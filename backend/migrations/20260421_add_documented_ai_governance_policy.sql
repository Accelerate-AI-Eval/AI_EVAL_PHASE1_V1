-- Vendor self attestation: documented AI governance policy (Yes/No) for AI Technical Capabilities
ALTER TABLE vendor_self_attestations
  ADD COLUMN IF NOT EXISTS documented_ai_governance_policy VARCHAR(100);
