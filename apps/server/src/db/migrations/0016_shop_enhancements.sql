-- 商城道具增强：描述字段 + 销售统计

-- 道具描述字段
ALTER TABLE sprite_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- 销售统计视图（通过查询 user_sprite_items 计算）
-- 注意：销售量通过 user_sprite_items 的 quantity 总和计算
-- 销售额 = 销售量 × 道具价格（需要从 sprite_items 关联）

-- 为销售统计添加索引
CREATE INDEX IF NOT EXISTS idx_user_sprite_items_item_code ON user_sprite_items(item_code);
CREATE INDEX IF NOT EXISTS idx_user_sprite_items_created_at ON user_sprite_items(created_at);
CREATE INDEX IF NOT EXISTS idx_user_sprite_items_updated_at ON user_sprite_items(updated_at);
