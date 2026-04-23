-- Audit log for user-initiated archive and reactive (restore) actions.
CREATE TABLE IF NOT EXISTS assessment_user_archive_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('archive', 'reactive')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_user_archive_log_assessment_id_idx
  ON assessment_user_archive_log (assessment_id);

CREATE INDEX IF NOT EXISTS assessment_user_archive_log_created_at_idx
  ON assessment_user_archive_log (created_at DESC);

COMMENT ON TABLE assessment_user_archive_log IS 'Reason and actor for archive/reactive from the assessments ledger.';
