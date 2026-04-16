-- Outline synopsis version management

CREATE TABLE IF NOT EXISTS "outline_versions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(20) NOT NULL,
  entity_id uuid NOT NULL,
  synopsis text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_outline_versions_entity" ON "outline_versions" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_outline_versions_deleted" ON "outline_versions" ("entity_type", "entity_id") WHERE "deleted_at" IS NULL;
