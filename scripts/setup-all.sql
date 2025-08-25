-- Complete Database Setup for Outfit Generator
-- This script sets up the entire database schema by running all scripts in order
-- 
-- USAGE:
-- In your Supabase SQL Editor, copy and paste this entire file and run it
-- OR run each script individually in the order listed below
--
-- PREREQUISITES:
-- - You must have a Supabase project created
-- - You must be in the SQL Editor with sufficient permissions

-- ========================================
-- SCRIPT 1: BASE TABLES
-- ========================================

-- Create clothing_items table with all AI analysis columns
CREATE TABLE IF NOT EXISTS clothing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  photo_url TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  -- AI-analyzed basic attributes
  description TEXT,
  category TEXT CHECK (category IN ('top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'underwear', 'swimwear', 'activewear', 'sleepwear', 'bag', 'jewelry', 'other')),
  subcategory TEXT,
  colors TEXT[] DEFAULT '{}',
  primary_color TEXT,
  pattern TEXT,
  material TEXT[] DEFAULT '{}',
  season TEXT[] DEFAULT '{}' CHECK (season <@ ARRAY['spring', 'summer', 'fall', 'winter', 'all-season']::TEXT[]),
  formality TEXT CHECK (formality IN ('casual', 'smart-casual', 'business', 'business-formal', 'formal', 'athleisure', 'loungewear')),
  style_tags TEXT[] DEFAULT '{}',
  brand TEXT,
  fit TEXT CHECK (fit IN ('slim', 'regular', 'relaxed', 'oversized')),
  
  -- Style and coordination fields
  neckline TEXT,
  sleeve_length TEXT CHECK (sleeve_length IN ('sleeveless', 'short', 'three-quarter', 'long', 'extra-long')),
  length TEXT,
  silhouette TEXT,
  texture TEXT,
  transparency TEXT CHECK (transparency IN ('opaque', 'semi-sheer', 'sheer', 'mesh')),
  layering_role TEXT CHECK (layering_role IN ('base', 'mid', 'outer', 'standalone')),
  
  -- Occasion and versatility
  occasions TEXT[] DEFAULT '{}',
  time_of_day TEXT[] DEFAULT '{}',
  weather_suitability TEXT[] DEFAULT '{}',
  temperature_range TEXT,
  
  -- Coordination hints
  color_coordination_notes TEXT,
  styling_notes TEXT,
  avoid_combinations TEXT[],
  best_paired_with TEXT[],
  
  -- Practical considerations
  care_level TEXT CHECK (care_level IN ('easy', 'moderate', 'high-maintenance')),
  wrinkle_resistance TEXT CHECK (wrinkle_resistance IN ('wrinkle-free', 'wrinkle-resistant', 'wrinkles-easily')),
  stretch_level TEXT CHECK (stretch_level IN ('no-stretch', 'slight-stretch', 'stretchy', 'very-stretchy')),
  comfort_level TEXT CHECK (comfort_level IN ('very-comfortable', 'comfortable', 'moderate', 'restrictive')),
  
  -- Advanced style attributes
  design_details TEXT[],
  print_scale TEXT CHECK (print_scale IN ('solid', 'small-print', 'medium-print', 'large-print', 'oversized-print')),
  vintage_era TEXT,
  trend_status TEXT CHECK (trend_status IN ('classic', 'trendy', 'vintage', 'timeless', 'statement')),
  
  -- Body type and styling
  flattering_for TEXT[],
  styling_versatility TEXT CHECK (styling_versatility IN ('very-versatile', 'versatile', 'moderate', 'specific-use')),
  
  -- Color and coordination
  undertones TEXT,
  color_intensity TEXT CHECK (color_intensity IN ('muted', 'medium', 'vibrant', 'neon')),
  color_dominance TEXT CHECK (color_dominance IN ('monochrome', 'primary-color', 'multi-color', 'colorblock')),
  
  -- AI metadata
  ai_attributes JSONB DEFAULT '{}'::JSONB,
  ai_analysis_version INTEGER DEFAULT 0,
  analyzed_at TIMESTAMP WITH TIME ZONE,
  
  -- User-managed fields
  size TEXT,
  favorite BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  user_metadata JSONB DEFAULT '{}'::JSONB
);

-- Create outfits table
CREATE TABLE IF NOT EXISTS outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_ids UUID[] NOT NULL DEFAULT '{}',
  rationale TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  -- Generation metadata
  request TEXT,
  occasion TEXT,
  weather TEXT,
  temperature_range INT4RANGE,
  style_preferences TEXT[],
  excluded_categories TEXT[],
  score REAL CHECK (score >= 0 AND score <= 1),
  ai_model TEXT,
  generation_time_ms INTEGER,
  
  -- User interaction
  worn BOOLEAN DEFAULT FALSE,
  worn_date DATE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  title TEXT
);

-- Enable Row Level Security for base tables
ALTER TABLE clothing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;

-- ========================================
-- SCRIPT 2: SHOPPING TABLES
-- ========================================

-- Shopping sessions table
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

-- Shopping analyses table
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

-- Wardrobe gaps table
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

-- Shopping wishlists table
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

-- Enable RLS for shopping tables
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_wishlists ENABLE ROW LEVEL SECURITY;

-- ========================================
-- SCRIPT 3: ASSISTANT TABLES
-- ========================================

-- Assistant threads table
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

-- Enable RLS for assistant tables
ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;

-- ========================================
-- SCRIPT 4: INDEXES
-- ========================================

-- Clothing Items Indexes
CREATE INDEX IF NOT EXISTS idx_clothing_items_user_id ON clothing_items(user_id);
CREATE INDEX IF NOT EXISTS idx_clothing_items_category ON clothing_items(category);
CREATE INDEX IF NOT EXISTS idx_clothing_items_formality ON clothing_items(formality);
CREATE INDEX IF NOT EXISTS idx_clothing_items_season ON clothing_items USING GIN(season);
CREATE INDEX IF NOT EXISTS idx_clothing_items_colors ON clothing_items USING GIN(colors);
CREATE INDEX IF NOT EXISTS idx_clothing_items_style_tags ON clothing_items USING GIN(style_tags);
CREATE INDEX IF NOT EXISTS idx_clothing_items_archived ON clothing_items(archived);
CREATE INDEX IF NOT EXISTS idx_clothing_items_favorite ON clothing_items(favorite);
CREATE INDEX IF NOT EXISTS idx_clothing_items_occasions ON clothing_items USING GIN(occasions);
CREATE INDEX IF NOT EXISTS idx_clothing_items_time_of_day ON clothing_items USING GIN(time_of_day);
CREATE INDEX IF NOT EXISTS idx_clothing_items_weather_suitability ON clothing_items USING GIN(weather_suitability);
CREATE INDEX IF NOT EXISTS idx_clothing_items_layering_role ON clothing_items(layering_role);
CREATE INDEX IF NOT EXISTS idx_clothing_items_formality_season ON clothing_items(formality, season);
CREATE INDEX IF NOT EXISTS idx_clothing_items_styling_versatility ON clothing_items(styling_versatility);
CREATE INDEX IF NOT EXISTS idx_clothing_items_best_paired_with ON clothing_items USING GIN(best_paired_with);
CREATE INDEX IF NOT EXISTS idx_clothing_items_created_at ON clothing_items(created_at);

-- Outfits Indexes
CREATE INDEX IF NOT EXISTS idx_outfits_user_id ON outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_outfits_created_at ON outfits(created_at);
CREATE INDEX IF NOT EXISTS idx_outfits_worn ON outfits(worn);
CREATE INDEX IF NOT EXISTS idx_outfits_rating ON outfits(rating);
CREATE INDEX IF NOT EXISTS idx_outfits_item_ids ON outfits USING GIN(item_ids);

-- Shopping Indexes
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_user_id ON shopping_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_started_at ON shopping_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_user_id ON shopping_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_session_id ON shopping_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_recommendation ON shopping_analyses(recommendation);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_decision ON shopping_analyses(decision);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_created_at ON shopping_analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_user_id ON wardrobe_gaps(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_filled ON wardrobe_gaps(filled);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_priority ON wardrobe_gaps(priority);
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_user_id ON shopping_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_analysis_id ON shopping_wishlists(analysis_id);
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_purchased ON shopping_wishlists(purchased);

-- Assistant Indexes
CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_id ON assistant_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_threads_assistant_type ON assistant_threads(assistant_type);
CREATE INDEX IF NOT EXISTS idx_assistant_threads_last_used_at ON assistant_threads(last_used_at);

-- ========================================
-- SCRIPT 5: RLS POLICIES
-- ========================================

-- Clothing Items Policies
CREATE POLICY "Users can view own clothing items" ON clothing_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own clothing items" ON clothing_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clothing items" ON clothing_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clothing items" ON clothing_items FOR DELETE USING (auth.uid() = user_id);

-- Outfits Policies
CREATE POLICY "Users can view own outfits" ON outfits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own outfits" ON outfits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own outfits" ON outfits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own outfits" ON outfits FOR DELETE USING (auth.uid() = user_id);

-- Shopping Sessions Policies
CREATE POLICY "Users can view own shopping sessions" ON shopping_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own shopping sessions" ON shopping_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shopping sessions" ON shopping_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own shopping sessions" ON shopping_sessions FOR DELETE USING (auth.uid() = user_id);

-- Shopping Analyses Policies
CREATE POLICY "Users can view own shopping analyses" ON shopping_analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own shopping analyses" ON shopping_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shopping analyses" ON shopping_analyses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own shopping analyses" ON shopping_analyses FOR DELETE USING (auth.uid() = user_id);

-- Wardrobe Gaps Policies
CREATE POLICY "Users can view own wardrobe gaps" ON wardrobe_gaps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own wardrobe gaps" ON wardrobe_gaps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wardrobe gaps" ON wardrobe_gaps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wardrobe gaps" ON wardrobe_gaps FOR DELETE USING (auth.uid() = user_id);

-- Shopping Wishlists Policies
CREATE POLICY "Users can view own wishlists" ON shopping_wishlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own wishlists" ON shopping_wishlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wishlists" ON shopping_wishlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wishlists" ON shopping_wishlists FOR DELETE USING (auth.uid() = user_id);

-- Assistant Threads Policies
CREATE POLICY "Users can view own assistant threads" ON assistant_threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own assistant threads" ON assistant_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assistant threads" ON assistant_threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assistant threads" ON assistant_threads FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- SCRIPT 6: DATA MIGRATIONS (Optional)
-- ========================================

-- Fix NULL values (only run if you have existing data)
-- Uncomment these lines if you're migrating from an existing database:

-- UPDATE clothing_items SET archived = false WHERE archived IS NULL;
-- UPDATE clothing_items SET favorite = false WHERE favorite IS NULL;
-- UPDATE clothing_items SET photo_urls = '{}' WHERE photo_urls IS NULL;
-- UPDATE outfits SET item_ids = '{}' WHERE item_ids IS NULL;

-- ========================================
-- SETUP COMPLETE
-- ========================================

-- Verify setup with a simple query
SELECT 
  schemaname, 
  tablename, 
  hasindexes, 
  hasrules, 
  hastriggers
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('clothing_items', 'outfits', 'shopping_sessions', 'shopping_analyses', 'wardrobe_gaps', 'shopping_wishlists', 'assistant_threads')
ORDER BY tablename;