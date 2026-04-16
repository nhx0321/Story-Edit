-- Sprite text management system: text entries and AI tasks

CREATE TYPE sprite_text_status AS ENUM ('draft', 'confirmed', 'published', 'failed');
CREATE TYPE sprite_text_type AS ENUM ('user-trigger', 'idle-phase');
CREATE TYPE sprite_ai_task_status AS ENUM ('pending', 'in_progress', 'success', 'failed');
CREATE TYPE sprite_ai_task_type AS ENUM ('analyze', 'implement');

CREATE TABLE sprite_text_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species varchar(20) NOT NULL,
  variant varchar(50) NOT NULL,
  level integer NOT NULL,              -- -1=generic template, 0-9=specific level
  text_type sprite_text_type NOT NULL,
  trigger_condition text NOT NULL,
  response_text text NOT NULL,
  status sprite_text_status NOT NULL DEFAULT 'draft',
  ai_task_id uuid,                     -- FK to sprite_ai_tasks (added later)
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE sprite_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  species varchar(20) NOT NULL,
  variant varchar(50) NOT NULL,
  level integer NOT NULL,
  task_type sprite_ai_task_type NOT NULL,
  input text NOT NULL,
  status sprite_ai_task_status NOT NULL DEFAULT 'pending',
  result text,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

-- FK from sprite_ai_tasks.entry_id → sprite_text_entries.id
ALTER TABLE sprite_ai_tasks ADD CONSTRAINT fk_sprite_ai_task_entry
  FOREIGN KEY (entry_id) REFERENCES sprite_text_entries(id);

-- FK from sprite_text_entries.ai_task_id → sprite_ai_tasks.id
ALTER TABLE sprite_text_entries ADD CONSTRAINT fk_sprite_text_ai_task
  FOREIGN KEY (ai_task_id) REFERENCES sprite_ai_tasks(id);

-- Indexes for efficient queries
CREATE INDEX idx_sprite_text_entries_species_variant ON sprite_text_entries(species, variant);
CREATE INDEX idx_sprite_text_entries_level ON sprite_text_entries(level);
CREATE INDEX idx_sprite_text_entries_status ON sprite_text_entries(status);
CREATE INDEX idx_sprite_ai_tasks_entry ON sprite_ai_tasks(entry_id);
