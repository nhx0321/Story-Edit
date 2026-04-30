-- 精灵商城道具清单：调整名称、图标对调，新增抚摸经验，按价格排序

UPDATE sprite_items SET
  name = CASE
    WHEN code = 'sunlight_essence' THEN '月亮露'
    WHEN code = 'moon_dew' THEN '阳光精华'
    ELSE name
  END,
  icon = CASE
    WHEN code = 'sunlight_essence' THEN '🌙'
    WHEN code = 'moon_dew' THEN '☀️'
    ELSE icon
  END,
  price = CASE
    WHEN code = 'pet' THEN 200
    ELSE price
  END,
  description = CASE
    WHEN code = 'pet' THEN '温柔的抚摸，精灵经验 +200'
    ELSE description
  END;
