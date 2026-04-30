-- Add writing_style column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS writing_style jsonb DEFAULT '{}'::jsonb;
