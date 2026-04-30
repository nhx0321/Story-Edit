-- 精灵商城 & 经验值 & VIP 兑换体系

-- 1. user_sprites 新增 total_xp 字段（经验值）
ALTER TABLE user_sprites ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;

-- 2. 同步已有数据：total_xp = total_bean_spent
UPDATE user_sprites SET total_xp = total_bean_spent WHERE total_xp IS NULL OR total_xp = 0;

-- 3. sprite_items 移除 refund_rate 字段（所有道具不可退款）
ALTER TABLE sprite_items DROP COLUMN IF EXISTS refund_rate;

-- 4. 清空旧道具数据，插入新道具清单（按价格排序：50 → 100 → 200 → 300 → 500 → 1000）
DELETE FROM sprite_items;

INSERT INTO sprite_items (code, name, species, effect_minutes, price, icon, description, is_active)
VALUES
  ('snack',             '精灵小食',   'all', 0,     50,   '🍬', '互动小零食，精灵经验 +50', true),
  ('watering_can',      '浇水壶',     'all', 1440,  100,  '🚿', '加速生长 1 天，精灵经验 +100', true),
  ('pet',               '抚摸',       'all', 0,     200,  '🤚', '温柔的抚摸，精灵经验 +200', true),
  ('nutrient',          '营养剂',     'all', 4320,  300,  '💊', '加速生长 3 天，精灵经验 +300', true),
  ('sunlight_essence',  '月亮露',     'all', 10080, 500,  '🌙', '加速生长 7 天，精灵经验 +500', true),
  ('moon_dew',          '阳光精华',   'all', 21600, 1000, '☀️', '加速生长 15 天，精灵经验 +1000', true);
