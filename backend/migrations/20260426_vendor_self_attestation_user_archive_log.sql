-- Audit log for user archive / reactive on vendor self-attestations.
CREATE TABLE IF NOT EXISTS vendor_self_attestation_user_archive_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_self_attestation_id uuid NOT NULL REFERENCES vendor_self_attestations(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('archive', 'reactive')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vsa_ual_attestation_id_idx
  ON vendor_self_attestation_user_archive_log (vendor_self_attestation_id);

CREATE INDEX IF NOT EXISTS vsa_ual_created_at_idx
  ON vendor_self_attestation_user_archive_log (created_at DESC);

COMMENT ON TABLE vendor_self_attestation_user_archive_log IS
  'Reason and actor for attestation archive/reactive from the attestation list.';
