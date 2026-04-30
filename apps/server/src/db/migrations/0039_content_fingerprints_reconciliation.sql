-- Reconciliation: formalize content_fingerprints into the canonical schema
-- This migration is append-only and targets the current mixed-reality database state.

CREATE TABLE IF NOT EXISTS content_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id),
  fingerprint_hash VARCHAR(64) NOT NULL,
  fingerprint_dec BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE content_fingerprints
  ALTER COLUMN created_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_fingerprints_template_id_unique'
  ) THEN
    ALTER TABLE content_fingerprints
      ADD CONSTRAINT content_fingerprints_template_id_unique UNIQUE (template_id);
  END IF;
END $$;
