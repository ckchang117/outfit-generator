-- Shopping Feature Tables
-- This script creates tables for Shopping Buddy functionality
-- Run after 01-base-tables.sql

-- Shopping sessions table - tracks when users are shopping
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name TEXT,
  location TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  ended_at TIMESTAMP WITH TIME ZONE,
  items_analyzed INTEGER DEFAULT 0,
  items_purchased INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Shopping analyses table - stores analyzed potential purchases
CREATE TABLE IF NOT EXISTS shopping_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES shopping_sessions(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  store_location TEXT,
  price DECIMAL(10, 2),
  analysis_result JSONB NOT NULL,
  compatibility_score INTEGER CHECK (compatibility_score >= 0 AND compatibility_score <= 100),
  recommendation TEXT CHECK (recommendation IN ('buy', 'skip', 'consider')),
  decision TEXT CHECK (decision IN ('bought', 'skipped', 'saved', 'pending')),
  actual_price DECIMAL(10, 2),
  purchase_date DATE,
  linked_item_id UUID REFERENCES clothing_items(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Wardrobe gaps table - identifies missing pieces
CREATE TABLE IF NOT EXISTS wardrobe_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  specifications JSONB,
  priority INTEGER CHECK (priority >= 1 AND priority <= 10),
  identified_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  filled BOOLEAN DEFAULT FALSE,
  filled_by UUID REFERENCES clothing_items(id) ON DELETE SET NULL,
  filled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Shopping wishlists - items saved for later
CREATE TABLE IF NOT EXISTS shopping_wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES shopping_analyses(id) ON DELETE CASCADE,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  target_price DECIMAL(10, 2),
  notes TEXT,
  reminder_date DATE,
  purchased BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable Row Level Security
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_wishlists ENABLE ROW LEVEL SECURITY;