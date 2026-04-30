CREATE TABLE IF NOT EXISTS "setting_relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "source_id" uuid NOT NULL,
  "target_id" uuid NOT NULL,
  "relation_type" varchar(30) NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
