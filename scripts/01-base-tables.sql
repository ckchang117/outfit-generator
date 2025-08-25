-- Base Tables for Outfit Generator
-- This script creates the core tables: clothing_items and outfits
-- Run this first before any other scripts

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

-- Enable Row Level Security
ALTER TABLE clothing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;