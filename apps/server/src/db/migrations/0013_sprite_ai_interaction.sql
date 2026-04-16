-- Sprite AI interaction system: conversations and interaction log

CREATE TABLE sprite_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role varchar(20) NOT NULL,          -- system / user / assistant
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE sprite_interaction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  action_type varchar(30) NOT NULL,    -- daily_feedback / unit_feedback / volume_feedback / user_chat
  ai_used boolean NOT NULL DEFAULT false,
  token_count integer,
  fatigue_level integer NOT NULL DEFAULT 0,  -- 0-100
  created_at timestamp NOT NULL DEFAULT now()
);

-- Index for querying recent conversations per user
CREATE INDEX idx_sprite_conv_user ON sprite_conversations(user_id, created_at DESC);

-- Index for checking daily feedback status
CREATE INDEX idx_sprite_log_user_action ON sprite_interaction_log(user_id, action_type, created_at DESC);
