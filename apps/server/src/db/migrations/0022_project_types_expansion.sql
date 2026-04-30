-- 重做项目类型和题材分类体系

-- 1. 扩展 project_type 枚举
ALTER TYPE project_type ADD VALUE IF NOT EXISTS 'webnovel';

-- 2. 扩展 genre 枚举（新增网文和剧本的三级题材）
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'serious_literature';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'historical_literature';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'children_literature';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'detective_novel';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'social_realism';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'wuxia_novel';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'historical_novel';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'historical_webnovel';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'ancient_romance';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'modern_romance';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'sweet_pet';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'entertainment';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'quick_transmigration';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'xianxia_romance';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'palace_intrigue';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'movie_drama';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'web_drama';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'short_drama';
ALTER TYPE genre ADD VALUE IF NOT EXISTS 'family_ethics';

-- 3. 为 genre_presets 增加二级类目和风格提示词字段
ALTER TABLE genre_presets ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE genre_presets ADD COLUMN IF NOT EXISTS style_prompt TEXT;
