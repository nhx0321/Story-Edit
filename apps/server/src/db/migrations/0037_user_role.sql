-- 用户角色字段：free(免费用户), paid(付费用户), tester(测试用户)
-- 管理员通过 is_admin 字段识别，不在此字段中
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role varchar(20) DEFAULT 'free';

-- 自动将已充值用户标记为 paid
UPDATE users SET user_role = 'paid'
WHERE id IN (
  SELECT user_id FROM user_token_accounts WHERE balance > 0
) AND user_role = 'free';

-- 管理员自动标记为 tester（管理员权限由 is_admin 控制，但日限额走 admin 逻辑）
-- 不需要额外处理，checkDailyLimit 会优先检查 isAdmin
