-- 项目软删除支持

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_projects_user_status" ON "projects" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_projects_deleted_at" ON "projects" ("deleted_at") WHERE deleted_at IS NOT NULL;
