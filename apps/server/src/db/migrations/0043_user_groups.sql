CREATE TABLE IF NOT EXISTS "user_groups" (
  "name" varchar(50) PRIMARY KEY,
  "display_name" varchar(100) NOT NULL,
  "daily_token_limit" bigint DEFAULT 100000,
  "allowed_model_groups" jsonb DEFAULT '["default"]',
  "description" text,
  "sort_order" integer DEFAULT 0,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 预置用户组（匹配现有角色）
INSERT INTO "user_groups" ("name", "display_name", "daily_token_limit", "allowed_model_groups", "description", "sort_order")
VALUES
  ('free',   '免费用户', 100000,  '["default"]',              '注册即可使用，仅限免费模型', 0),
  ('paid',   '付费用户', 500000,  '["default","premium"]',    '充值用户，可使用全部模型',   1),
  ('tester', '测试用户', 300000,  '["default"]',              '内测用户，仅限免费模型',     2),
  ('admin',  '管理员',   0,       '["default","premium"]',    '管理员，无限额，全部模型',   3)
ON CONFLICT DO NOTHING;
