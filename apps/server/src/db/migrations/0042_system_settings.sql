CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" varchar(100) PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 默认开启充值功能
INSERT INTO "system_settings" ("key", "value") VALUES ('recharge_enabled', 'true') ON CONFLICT DO NOTHING;
