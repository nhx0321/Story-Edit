-- Add update_count column to memory_entries for tracking merge/promotion
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS update_count integer NOT NULL DEFAULT 1;
