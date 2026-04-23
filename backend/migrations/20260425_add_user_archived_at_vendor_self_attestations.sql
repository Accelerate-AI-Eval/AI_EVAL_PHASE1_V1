-- User-initiated archive: completed vendor self-attestations can be moved to the Archived tab.
ALTER TABLE vendor_self_attestations
  ADD COLUMN IF NOT EXISTS user_archived_at timestamptz;

COMMENT ON COLUMN vendor_self_attestations.user_archived_at IS
  'Set when a user archives a completed (non–time-expired) attestation; cleared when restored.';
