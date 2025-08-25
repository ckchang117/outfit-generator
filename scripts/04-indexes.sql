-- Database Indexes for Performance
-- This script creates all indexes for optimal query performance
-- Run after all table creation scripts

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

-- Shopping Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_user_id ON shopping_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_started_at ON shopping_sessions(started_at);

-- Shopping Analyses Indexes
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_user_id ON shopping_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_session_id ON shopping_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_recommendation ON shopping_analyses(recommendation);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_decision ON shopping_analyses(decision);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_created_at ON shopping_analyses(created_at);

-- Wardrobe Gaps Indexes
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_user_id ON wardrobe_gaps(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_filled ON wardrobe_gaps(filled);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_priority ON wardrobe_gaps(priority);

-- Shopping Wishlists Indexes
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_user_id ON shopping_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_analysis_id ON shopping_wishlists(analysis_id);
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_purchased ON shopping_wishlists(purchased);

-- Assistant Threads Indexes
CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_id ON assistant_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_threads_assistant_type ON assistant_threads(assistant_type);
CREATE INDEX IF NOT EXISTS idx_assistant_threads_last_used_at ON assistant_threads(last_used_at);