-- Sprite system migration

-- 精灵用户数据表
CREATE TABLE user_sprites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  species varchar(20) NOT NULL,
  variant varchar(50) NOT NULL,
  level integer NOT NULL DEFAULT 1,
  custom_name varchar(100),
  user_nickname varchar(100),
  companion_style varchar(20) DEFAULT 'quiet',
  total_active_days integer DEFAULT 0,
  bonus_days integer DEFAULT 0,
  last_active_date date,
  position_x integer DEFAULT 20,
  position_y integer DEFAULT 80,
  is_hatched boolean DEFAULT false,
  guide_step integer DEFAULT 0,
  secret_shop_found boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- 精灵形象图片表
CREATE TABLE sprite_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species varchar(20) NOT NULL,
  variant varchar(50) NOT NULL,
  level integer NOT NULL,
  image_url text NOT NULL,
  prompt_used text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  UNIQUE(species, variant, level)
);

-- 道具定义表
CREATE TABLE sprite_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  species varchar(20) NOT NULL,
  effect_minutes integer NOT NULL,
  price integer NOT NULL,
  icon varchar(10),
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- 用户道具表
CREATE TABLE user_sprite_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  item_code varchar(50) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id, item_code)
);

-- 插入基础道具数据
INSERT INTO sprite_items (code, name, species, effect_minutes, price, icon) VALUES
('water_drop', '水滴', 'plant', 30, 100, '💧'),
('shears', '小剪刀', 'plant', 60, 200, '✂️'),
('bath', '泡泡浴', 'animal', 30, 100, '🫧'),
('snack', '小零食', 'animal', 60, 200, '🍪'),
('energy', '能量块', 'element', 30, 100, '⚡'),
('crystal', '调和晶', 'element', 60, 200, '💎');
