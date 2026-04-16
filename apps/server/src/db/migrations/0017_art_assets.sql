-- 美术资产管理系统
-- 新增 art_assets 表，用于管理所有精灵美术资产
-- 修改 sprite_images 表，增加 asset_id 关联

-- 美术资产注册表
CREATE TABLE art_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 分类
  category VARCHAR(30) NOT NULL,     -- character / item / effect / ui / animation
  subcategory VARCHAR(30),           -- plant/animal/element, idle/upgrade/interact 等
  asset_key VARCHAR(100) NOT NULL,   -- 唯一键: "character/fox/L3", "item/water_drop/icon"

  -- 描述
  name VARCHAR(100) NOT NULL,        -- 显示名称
  description TEXT,                  -- 资产描述

  -- 技术规格
  file_format VARCHAR(10),           -- png / svg / json(lottie)
  width INTEGER,                     -- 像素宽
  height INTEGER,                    -- 像素高
  file_size INTEGER,                 -- 字节

  -- 文件位置
  storage_path TEXT NOT NULL,        -- 相对路径: "assets/sprites/characters/animal/fox/L3.png"
  cdn_url TEXT,                      -- CDN完整URL（可选）

  -- 状态
  is_published BOOLEAN DEFAULT false,-- 是否已发布（前端可用）
  is_active BOOLEAN DEFAULT true,    -- 是否激活

  -- 版本
  version INTEGER DEFAULT 1,         -- 版本号（替换时递增）
  replaced_by UUID REFERENCES art_assets(id),  -- 指向新版本asset

  -- 审计
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(category, asset_key, version)
);

CREATE INDEX idx_art_assets_lookup ON art_assets(category, asset_key, is_published, is_active);
CREATE INDEX idx_art_assets_category ON art_assets(category);

-- sprite_images 表增加 asset_id 关联
ALTER TABLE sprite_images
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES art_assets(id);
