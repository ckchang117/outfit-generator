-- Add advanced metadata columns for better outfit generation
-- Run this after the initial add-item-metadata-columns.sql

ALTER TABLE clothing_items
  -- Style and coordination fields
  ADD COLUMN IF NOT EXISTS neckline TEXT, -- crew, v-neck, scoop, off-shoulder, etc.
  ADD COLUMN IF NOT EXISTS sleeve_length TEXT CHECK (sleeve_length IN ('sleeveless', 'short', 'three-quarter', 'long', 'extra-long')),
  ADD COLUMN IF NOT EXISTS length TEXT, -- mini, knee-length, midi, maxi, etc.
  ADD COLUMN IF NOT EXISTS silhouette TEXT, -- a-line, straight, fitted, flowy, etc.
  ADD COLUMN IF NOT EXISTS texture TEXT, -- smooth, textured, ribbed, cable-knit, etc.
  ADD COLUMN IF NOT EXISTS transparency TEXT CHECK (transparency IN ('opaque', 'semi-sheer', 'sheer', 'mesh')),
  ADD COLUMN IF NOT EXISTS layering_role TEXT CHECK (layering_role IN ('base', 'mid', 'outer', 'standalone')),
  
  -- Occasion and versatility
  ADD COLUMN IF NOT EXISTS occasions TEXT[] DEFAULT '{}', -- work, casual, date, party, sport, etc.
  ADD COLUMN IF NOT EXISTS time_of_day TEXT[] DEFAULT '{}', -- morning, afternoon, evening, night
  ADD COLUMN IF NOT EXISTS weather_suitability TEXT[] DEFAULT '{}', -- sunny, rainy, windy, snowy
  ADD COLUMN IF NOT EXISTS temperature_range TEXT, -- "15-25C", "cold", "warm", etc.
  
  -- Coordination hints
  ADD COLUMN IF NOT EXISTS color_coordination_notes TEXT, -- "pairs well with neutrals", "statement piece"
  ADD COLUMN IF NOT EXISTS styling_notes TEXT, -- "tuck in", "layer over", "roll sleeves"
  ADD COLUMN IF NOT EXISTS avoid_combinations TEXT[], -- items/styles to avoid pairing with
  ADD COLUMN IF NOT EXISTS best_paired_with TEXT[], -- categories that work well together
  
  -- Practical considerations
  ADD COLUMN IF NOT EXISTS care_level TEXT CHECK (care_level IN ('easy', 'moderate', 'high-maintenance')),
  ADD COLUMN IF NOT EXISTS wrinkle_resistance TEXT CHECK (wrinkle_resistance IN ('wrinkle-free', 'wrinkle-resistant', 'wrinkles-easily')),
  ADD COLUMN IF NOT EXISTS stretch_level TEXT CHECK (stretch_level IN ('no-stretch', 'slight-stretch', 'stretchy', 'very-stretchy')),
  ADD COLUMN IF NOT EXISTS comfort_level TEXT CHECK (comfort_level IN ('very-comfortable', 'comfortable', 'moderate', 'restrictive')),
  
  -- Advanced style attributes
  ADD COLUMN IF NOT EXISTS design_details TEXT[], -- buttons, zippers, pockets, embellishments, etc.
  ADD COLUMN IF NOT EXISTS print_scale TEXT CHECK (print_scale IN ('solid', 'small-print', 'medium-print', 'large-print', 'oversized-print')),
  ADD COLUMN IF NOT EXISTS vintage_era TEXT, -- 70s, 80s, 90s, modern, etc.
  ADD COLUMN IF NOT EXISTS trend_status TEXT CHECK (trend_status IN ('classic', 'trendy', 'vintage', 'timeless', 'statement')),
  
  -- Body type and styling
  ADD COLUMN IF NOT EXISTS flattering_for TEXT[], -- body types this works well for
  ADD COLUMN IF NOT EXISTS styling_versatility TEXT CHECK (styling_versatility IN ('very-versatile', 'versatile', 'moderate', 'specific-use')),
  
  -- Color and coordination
  ADD COLUMN IF NOT EXISTS undertones TEXT, -- warm, cool, neutral
  ADD COLUMN IF NOT EXISTS color_intensity TEXT CHECK (color_intensity IN ('muted', 'medium', 'vibrant', 'neon')),
  ADD COLUMN IF NOT EXISTS color_dominance TEXT CHECK (color_dominance IN ('monochrome', 'primary-color', 'multi-color', 'colorblock'));

-- Add indexes for the new fields that will be used in queries
CREATE INDEX IF NOT EXISTS idx_clothing_items_occasions ON clothing_items USING GIN(occasions);
CREATE INDEX IF NOT EXISTS idx_clothing_items_time_of_day ON clothing_items USING GIN(time_of_day);
CREATE INDEX IF NOT EXISTS idx_clothing_items_weather_suitability ON clothing_items USING GIN(weather_suitability);
CREATE INDEX IF NOT EXISTS idx_clothing_items_layering_role ON clothing_items(layering_role);
CREATE INDEX IF NOT EXISTS idx_clothing_items_formality_season ON clothing_items(formality, season);
CREATE INDEX IF NOT EXISTS idx_clothing_items_styling_versatility ON clothing_items(styling_versatility);
CREATE INDEX IF NOT EXISTS idx_clothing_items_best_paired_with ON clothing_items USING GIN(best_paired_with);