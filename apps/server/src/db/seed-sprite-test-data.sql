-- ============================================================
-- 精灵系统测试数据：道具 + 测试精灵（0-1级 × 2, 0-2级 × 1）
-- ============================================================

-- ---------- 道具数据 ----------
INSERT INTO sprite_items (code, name, species, effect_minutes, price, icon, is_active)
VALUES
  ('sunlight',    '阳光水滴', 'plant',   1440, 50,  '💧', true),
  ('feather',     '蓬松羽毛', 'animal',  1440, 50,  '🪶', true),
  ('breeze',      '微风宝瓶', 'element', 1440, 50,  '🏺', true),
  ('snack',       '精灵小食', 'all',     0,    10,  '🍬', true),
  ('blanket',     '精灵小毯', 'all',     0,    20,  '🛏️', true),
  ('music_box',   '音乐盒',   'all',     0,    30,  '🎵', true)
ON CONFLICT (code) DO NOTHING;

-- ---------- 测试用户精灵 ----------
-- 测试精灵1：植物系·向日葵 Lv.1（从Lv.0孵化到Lv.1）
INSERT INTO user_sprites (user_id, species, variant, custom_name, user_nickname, companion_style,
                          total_active_days, bonus_days, is_hatched, guide_step, bean_balance)
SELECT
  id, 'plant', 'sunflower', '小阳', '测试员阿木', 'active',
  0, 0, true, 5, 500
FROM users
WHERE email = 'test_sunflower@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- 测试精灵2：动物系·小狐狸 Lv.1（从Lv.0孵化到Lv.1）
INSERT INTO user_sprites (user_id, species, variant, custom_name, user_nickname, companion_style,
                          total_active_days, bonus_days, is_hatched, guide_step, bean_balance)
SELECT
  id, 'animal', 'fox', '阿狐', '测试员小狐', 'quiet',
  0, 0, true, 5, 500
FROM users
WHERE email = 'test_fox@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- 测试精灵3：元素系·小风灵 Lv.2（从Lv.0孵化到Lv.1再到Lv.2，测试升级动画）
INSERT INTO user_sprites (user_id, species, variant, custom_name, user_nickname, companion_style,
                          total_active_days, bonus_days, is_hatched, guide_step, bean_balance)
SELECT
  id, 'element', 'wind', '微风', '测试员微风', 'quiet',
  26, 0, true, 5, 1000
FROM users
WHERE email = 'test_wind@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- ---------- 测试精灵道具库存 ----------
-- 给3个测试精灵各发一份全套道具用于测试
INSERT INTO user_sprite_items (user_id, item_code, quantity)
SELECT u.id, 'sunlight', 5 FROM users u WHERE u.email IN ('test_sunflower@test.com','test_fox@test.com','test_wind@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO user_sprite_items (user_id, item_code, quantity)
SELECT u.id, 'feather', 5 FROM users u WHERE u.email IN ('test_sunflower@test.com','test_fox@test.com','test_wind@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO user_sprite_items (user_id, item_code, quantity)
SELECT u.id, 'breeze', 5 FROM users u WHERE u.email IN ('test_sunflower@test.com','test_fox@test.com','test_wind@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO user_sprite_items (user_id, item_code, quantity)
SELECT u.id, 'snack', 10 FROM users u WHERE u.email IN ('test_sunflower@test.com','test_fox@test.com','test_wind@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO user_sprite_items (user_id, item_code, quantity)
SELECT u.id, 'blanket', 5 FROM users u WHERE u.email IN ('test_sunflower@test.com','test_fox@test.com','test_wind@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO user_sprite_items (user_id, item_code, quantity)
SELECT u.id, 'music_box', 5 FROM users u WHERE u.email IN ('test_sunflower@test.com','test_fox@test.com','test_wind@test.com')
ON CONFLICT DO NOTHING;
