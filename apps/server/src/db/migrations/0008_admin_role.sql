-- Migration 0008: Add admin role to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;
