-- Migration 0015: Fix admin permissions for nhx0321@163.com
-- 确保 nhx0321@163.com 用户获得总管理员权限（level 0）
-- 同时检查所有 is_admin=true 的用户 admin_level 是否正确

-- 按邮箱匹配总管理员
UPDATE users SET is_admin = true, admin_level = 0 WHERE email = 'nhx0321@163.com';

-- 确保所有 is_admin=true 但 admin_level IS NULL 的用户设为 level 1（默认管理员）
UPDATE users SET admin_level = 1 WHERE is_admin = true AND admin_level IS NULL;

-- 检查：显示所有管理员
SELECT id, nickname, email, is_admin, admin_level, display_id FROM users WHERE is_admin = true;
