CREATE TABLE "edit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "entity_type" varchar(20) NOT NULL,
  "entity_id" uuid NOT NULL,
  "field_name" varchar(50) NOT NULL,
  "old_value" text,
  "new_value" text,
  "edit_reason" text,
  "ai_role" varchar(50),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX edit_logs_entity_idx ON edit_logs(project_id, entity_type, entity_id);
