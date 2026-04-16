-- Phase 7: Template system v2 — creation, publishing, comments, billing

-- ===== user_templates 扩展 =====
ALTER TABLE "user_templates" ADD COLUMN IF NOT EXISTS "category" varchar(100);
ALTER TABLE "user_templates" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "user_templates" ADD COLUMN IF NOT EXISTS "is_from_purchase" boolean DEFAULT false;
ALTER TABLE "user_templates" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "user_templates" ADD COLUMN IF NOT EXISTS "can_republish" boolean DEFAULT true;
ALTER TABLE "user_templates" ADD COLUMN IF NOT EXISTS "audit_status" varchar(20); -- pending / locked / null

-- ===== templates 扩展 =====
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "comments_count" integer DEFAULT 0;
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "likes_count" integer DEFAULT 0;
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "is_published" boolean DEFAULT false;
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "review_reason" text;

-- ===== 模板版本管理 =====
CREATE TABLE IF NOT EXISTS "template_versions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_template_id uuid NOT NULL REFERENCES "user_templates"(id),
  content text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ===== 模板评论 =====
CREATE TABLE IF NOT EXISTS "template_comments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES "templates"(id),
  user_id uuid NOT NULL REFERENCES "users"(id),
  content text NOT NULL,
  parent_comment_id uuid REFERENCES "template_comments"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ===== 提现申请 =====
CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  amount integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ===== 索引 =====
CREATE INDEX IF NOT EXISTS "idx_user_templates_category" ON "user_templates" ("category");
CREATE INDEX IF NOT EXISTS "idx_user_templates_deleted" ON "user_templates" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_template_versions_user_template" ON "template_versions" ("user_template_id");
CREATE INDEX IF NOT EXISTS "idx_template_comments_template" ON "template_comments" ("template_id");
CREATE INDEX IF NOT EXISTS "idx_withdrawal_requests_user" ON "withdrawal_requests" ("user_id");
