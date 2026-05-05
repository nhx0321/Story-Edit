ALTER TABLE token_consumption_logs
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES api_channels(id);

CREATE INDEX IF NOT EXISTS idx_token_consumption_channel_id
  ON token_consumption_logs(channel_id);

CREATE INDEX IF NOT EXISTS idx_token_consumption_channel_created_at
  ON token_consumption_logs(channel_id, created_at);