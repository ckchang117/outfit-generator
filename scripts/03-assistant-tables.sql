-- OpenAI Assistant Integration Tables
-- This script creates tables for OpenAI assistant thread management
-- Run after 01-base-tables.sql

-- Assistant threads table - tracks OpenAI assistant conversations
CREATE TABLE IF NOT EXISTS assistant_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  assistant_type TEXT NOT NULL CHECK (assistant_type IN ('catalog', 'stylist')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  metadata JSONB DEFAULT '{}'::JSONB,
  UNIQUE(user_id, assistant_type)
);

-- Enable Row Level Security
ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;