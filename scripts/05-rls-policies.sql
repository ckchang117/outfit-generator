-- Row Level Security Policies
-- This script sets up RLS policies to ensure users can only access their own data
-- Run after all table creation scripts

-- ========================================
-- CLOTHING ITEMS POLICIES
-- ========================================

-- Users can view their own clothing items
CREATE POLICY "Users can view own clothing items" ON clothing_items
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create clothing items for themselves
CREATE POLICY "Users can create own clothing items" ON clothing_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own clothing items
CREATE POLICY "Users can update own clothing items" ON clothing_items
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own clothing items
CREATE POLICY "Users can delete own clothing items" ON clothing_items
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- OUTFITS POLICIES
-- ========================================

-- Users can view their own outfits
CREATE POLICY "Users can view own outfits" ON outfits
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create outfits for themselves
CREATE POLICY "Users can create own outfits" ON outfits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own outfits
CREATE POLICY "Users can update own outfits" ON outfits
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own outfits
CREATE POLICY "Users can delete own outfits" ON outfits
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- SHOPPING SESSIONS POLICIES
-- ========================================

-- Users can view their own shopping sessions
CREATE POLICY "Users can view own shopping sessions" ON shopping_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own shopping sessions
CREATE POLICY "Users can create own shopping sessions" ON shopping_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own shopping sessions
CREATE POLICY "Users can update own shopping sessions" ON shopping_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own shopping sessions
CREATE POLICY "Users can delete own shopping sessions" ON shopping_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- SHOPPING ANALYSES POLICIES
-- ========================================

-- Users can view their own shopping analyses
CREATE POLICY "Users can view own shopping analyses" ON shopping_analyses
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own shopping analyses
CREATE POLICY "Users can create own shopping analyses" ON shopping_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own shopping analyses
CREATE POLICY "Users can update own shopping analyses" ON shopping_analyses
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own shopping analyses
CREATE POLICY "Users can delete own shopping analyses" ON shopping_analyses
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- WARDROBE GAPS POLICIES
-- ========================================

-- Users can view their own wardrobe gaps
CREATE POLICY "Users can view own wardrobe gaps" ON wardrobe_gaps
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own wardrobe gaps
CREATE POLICY "Users can create own wardrobe gaps" ON wardrobe_gaps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own wardrobe gaps
CREATE POLICY "Users can update own wardrobe gaps" ON wardrobe_gaps
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own wardrobe gaps
CREATE POLICY "Users can delete own wardrobe gaps" ON wardrobe_gaps
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- SHOPPING WISHLISTS POLICIES
-- ========================================

-- Users can view their own wishlists
CREATE POLICY "Users can view own wishlists" ON shopping_wishlists
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own wishlists
CREATE POLICY "Users can create own wishlists" ON shopping_wishlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own wishlists
CREATE POLICY "Users can update own wishlists" ON shopping_wishlists
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own wishlists
CREATE POLICY "Users can delete own wishlists" ON shopping_wishlists
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- ASSISTANT THREADS POLICIES
-- ========================================

-- Users can view their own assistant threads
CREATE POLICY "Users can view own assistant threads" ON assistant_threads
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own assistant threads
CREATE POLICY "Users can create own assistant threads" ON assistant_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own assistant threads
CREATE POLICY "Users can update own assistant threads" ON assistant_threads
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own assistant threads
CREATE POLICY "Users can delete own assistant threads" ON assistant_threads
  FOR DELETE USING (auth.uid() = user_id);