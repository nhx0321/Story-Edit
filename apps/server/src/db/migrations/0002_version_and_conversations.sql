-- 版本管理增强 + AI对话表

-- chapterVersions 新增字段
ALTER TABLE "chapter_versions" ADD COLUMN "parent_version_id" uuid;
ALTER TABLE "chapter_versions" ADD COLUMN "sub_version_number" integer DEFAULT 0;
ALTER TABLE "chapter_versions" ADD COLUMN "status" varchar(20) DEFAULT 'active';
ALTER TABLE "chapter_versions" ADD COLUMN "label" varchar(200);
ALTER TABLE "chapter_versions" ADD COLUMN "source_chapter_id" uuid;

CREATE INDEX "idx_cv_chapter_status" ON "chapter_versions" ("chapter_id", "status");
CREATE INDEX "idx_cv_parent" ON "chapter_versions" ("parent_version_id");

-- AI 对话
DO $$ BEGIN
  CREATE TYPE "conversation_type" AS ENUM ('outline', 'settings', 'chapter');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "type" "conversation_type" NOT NULL,
  "title" varchar(200) NOT NULL,
  "target_entity_id" uuid,
  "target_entity_type" varchar(50),
  "role_key" varchar(50) NOT NULL,
  "workflow_step_id" varchar(50),
  "status" varchar(20) DEFAULT 'active',
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "role" varchar(20) NOT NULL,
  "content" text NOT NULL,
  "action_type" varchar(50),
  "action_payload" jsonb,
  "token_count" integer DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_conv_project" ON "conversations" ("project_id", "type");
CREATE INDEX "idx_msg_conv" ON "conversation_messages" ("conversation_id", "sort_order");
