-- AI 配置新增 is_default 字段
ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- 确保每个用户只有一个默认配置（通过触发器维护）
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
