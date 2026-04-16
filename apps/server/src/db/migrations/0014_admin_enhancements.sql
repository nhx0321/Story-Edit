-- Migration 0014: Admin Enhancements
-- 用户ID识别码、管理员权限体系、操作日志、系统预设、用户限制

-- 1. 用户ID识别码
ALTER TABLE users ADD COLUMN display_id VARCHAR(12) UNIQUE;

-- 2. 管理员权限体系
ALTER TABLE users ADD COLUMN admin_level INTEGER DEFAULT NULL;

-- 3. 用户限制字段
ALTER TABLE users ADD COLUMN banned_from_publish BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN banned_from_payment BOOLEAN DEFAULT false;

-- 4. 操作日志表
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  admin_level INTEGER,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(30),
  target_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 5. 系统预设表
CREATE TABLE system_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  project_type VARCHAR(20),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 6. 为已有管理员设置 admin_level
UPDATE users SET admin_level = 0 WHERE is_admin = true AND admin_level IS NULL;

-- 7. 初始化超级管理员 nhx0321
UPDATE users SET is_admin = true, admin_level = 0 WHERE nickname = 'nhx0321';

-- 8. 为已有用户生成 display_id（注册时自动生成的逻辑在代码层）
-- 对已有用户批量生成
DO $$
DECLARE
  r RECORD;
  next_id INTEGER;
BEGIN
  next_id := 100001;
  FOR r IN SELECT id FROM users WHERE display_id IS NULL ORDER BY created_at LOOP
    UPDATE users SET display_id = 'UID' || LPAD(next_id::TEXT, 6, '0') WHERE id = r.id;
    next_id := next_id + 1;
  END LOOP;
END $$;
