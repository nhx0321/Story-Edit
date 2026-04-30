-- Reconciliation: formalize ai_configs default selection governance
-- Keep database-level enforcement and stop relying on orphan history.

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

UPDATE ai_configs
SET is_default = false
WHERE is_default IS NULL;

WITH ranked_defaults AS (
  SELECT id,
         user_id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM ai_configs
  WHERE is_default = true
)
UPDATE ai_configs AS target
SET is_default = false
FROM ranked_defaults AS ranked
WHERE target.id = ranked.id
  AND ranked.rn > 1;

CREATE OR REPLACE FUNCTION enforce_single_default_config()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE ai_configs
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_single_default ON ai_configs;
CREATE TRIGGER trg_enforce_single_default
  BEFORE INSERT OR UPDATE ON ai_configs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_default_config();

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_configs_one_default_per_user
  ON ai_configs (user_id)
  WHERE is_default = true;
