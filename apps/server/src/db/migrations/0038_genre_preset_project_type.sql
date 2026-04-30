-- 题材预设增加项目类型分类（网文/小说/剧本）
ALTER TABLE genre_presets ADD COLUMN IF NOT EXISTS project_type varchar(20) DEFAULT 'webnovel';

-- 根据题材自动分类已有数据
UPDATE genre_presets SET project_type = 'novel' WHERE genre IN (
  'serious_literature', 'historical_literature', 'children_literature',
  'detective_novel', 'social_realism', 'wuxia_novel',
  'historical_novel'
);

UPDATE genre_presets SET project_type = 'screenplay' WHERE genre IN (
  'movie_drama', 'web_drama', 'short_drama', 'family_ethics',
  'palace_intrigue'
);
