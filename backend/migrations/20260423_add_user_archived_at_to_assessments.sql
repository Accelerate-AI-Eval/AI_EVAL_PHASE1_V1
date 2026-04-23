-- User-initiated archive: completed assessments can be moved to the Archived tab in the UI.
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS user_archived_at timestamptz;

COMMENT ON COLUMN assessments.user_archived_at IS 'Set when a user archives a completed assessment; cleared when restored (while still not time-expired).';
