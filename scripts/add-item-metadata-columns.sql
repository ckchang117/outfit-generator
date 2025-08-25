-- Add structured metadata columns to clothing_items table
-- This enables AI-powered outfit generation with detailed item attributes

ALTER TABLE clothing_items
  -- AI-analyzable fields from images
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'underwear', 'swimwear', 'activewear', 'sleepwear', 'bag', 'jewelry', 'other')),
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS pattern TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS season TEXT[] DEFAULT '{}' CHECK (season <@ ARRAY['spring', 'summer', 'fall', 'winter', 'all-season']::TEXT[]),
  ADD COLUMN IF NOT EXISTS formality TEXT CHECK (formality IN ('casual', 'smart-casual', 'business', 'business-formal', 'formal', 'athleisure', 'loungewear')),
  ADD COLUMN IF NOT EXISTS style_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS fit TEXT CHECK (fit IN ('slim', 'regular', 'relaxed', 'oversized')),
  ADD COLUMN IF NOT EXISTS ai_attributes JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS ai_analysis_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE,
  
  -- User-managed fields
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_metadata JSONB DEFAULT '{}'::JSONB;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clothing_items_category ON clothing_items(category);
CREATE INDEX IF NOT EXISTS idx_clothing_items_formality ON clothing_items(formality);
CREATE INDEX IF NOT EXISTS idx_clothing_items_season ON clothing_items USING GIN(season);
CREATE INDEX IF NOT EXISTS idx_clothing_items_colors ON clothing_items USING GIN(colors);
CREATE INDEX IF NOT EXISTS idx_clothing_items_style_tags ON clothing_items USING GIN(style_tags);
CREATE INDEX IF NOT EXISTS idx_clothing_items_archived ON clothing_items(archived);
CREATE INDEX IF NOT EXISTS idx_clothing_items_favorite ON clothing_items(favorite);

-- Add columns to outfits table for better tracking
ALTER TABLE outfits
  ADD COLUMN IF NOT EXISTS request TEXT,
  ADD COLUMN IF NOT EXISTS occasion TEXT,
  ADD COLUMN IF NOT EXISTS weather TEXT,
  ADD COLUMN IF NOT EXISTS temperature_range INT4RANGE,
  ADD COLUMN IF NOT EXISTS style_preferences TEXT[],
  ADD COLUMN IF NOT EXISTS excluded_categories TEXT[],
  ADD COLUMN IF NOT EXISTS score REAL CHECK (score >= 0 AND score <= 1),
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS generation_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS worn BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS worn_date DATE,
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for outfit queries
CREATE INDEX IF NOT EXISTS idx_outfits_worn ON outfits(worn);
CREATE INDEX IF NOT EXISTS idx_outfits_rating ON outfits(rating);

-- Optional: Add assistant thread tracking table
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

-- Add RLS policies for assistant_threads
ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assistant threads" ON assistant_threads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own assistant threads" ON assistant_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assistant threads" ON assistant_threads
  FOR UPDATE USING (auth.uid() = user_id);
