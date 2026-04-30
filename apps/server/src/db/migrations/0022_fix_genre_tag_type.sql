-- 修复 genre_tag 列类型：从 genre 枚举改为 varchar
-- 前端发送的子题材代码（如 scifi_web, soldier_king）不在 genre 枚举中
ALTER TABLE projects ALTER COLUMN genre_tag TYPE varchar(100);
