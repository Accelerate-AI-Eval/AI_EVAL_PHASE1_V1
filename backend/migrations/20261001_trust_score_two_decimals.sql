-- Store headline trust scores to 2 decimal places in the score columns.
ALTER TABLE generated_profile_reports
  ALTER COLUMN trust_score TYPE numeric(5, 2) USING trust_score::numeric(5, 2);

ALTER TABLE vendor_self_attestations
  ALTER COLUMN latest_trust_score TYPE numeric(5, 2) USING latest_trust_score::numeric(5, 2);
