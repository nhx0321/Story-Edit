-- 模板表新增软删除字段
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

-- 已删除模板索引
CREATE INDEX IF NOT EXISTS "idx_templates_deleted" ON "templates" ("deleted_at");
