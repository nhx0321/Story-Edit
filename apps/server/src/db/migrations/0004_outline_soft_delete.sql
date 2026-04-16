-- 大纲元素（卷/单元/章节）软删除支持

ALTER TABLE "volumes" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active';
ALTER TABLE "volumes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active';
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

-- 设定软删除支持
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_volumes_project_status" ON "volumes" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "idx_units_volume_status" ON "units" ("volume_id", "status");
CREATE INDEX IF NOT EXISTS "idx_chapters_unit_status" ON "chapters" ("unit_id", "status");
CREATE INDEX IF NOT EXISTS "idx_volumes_deleted_at" ON "volumes" ("deleted_at") WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_units_deleted_at" ON "units" ("deleted_at") WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_chapters_deleted_at" ON "chapters" ("deleted_at") WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_settings_deleted_at" ON "settings" ("deleted_at") WHERE deleted_at IS NOT NULL;
