-- Shopping Buddy Feature Database Schema
-- This adds tables to track shopping sessions and potential purchases

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

-- Potential purchases table - stores analyzed items
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
  linked_item_id UUID REFERENCES clothing_items(id) ON DELETE SET NULL, -- If they buy it
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_user_id ON shopping_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_user_id ON shopping_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_recommendation ON shopping_analyses(recommendation);
CREATE INDEX IF NOT EXISTS idx_shopping_analyses_decision ON shopping_analyses(decision);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_user_id ON wardrobe_gaps(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_gaps_filled ON wardrobe_gaps(filled);
CREATE INDEX IF NOT EXISTS idx_shopping_wishlists_user_id ON shopping_wishlists(user_id);

-- Enable Row Level Security
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_wishlists ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shopping_sessions
CREATE POLICY "Users can view own shopping sessions" ON shopping_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own shopping sessions" ON shopping_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shopping sessions" ON shopping_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shopping sessions" ON shopping_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for shopping_analyses
CREATE POLICY "Users can view own shopping analyses" ON shopping_analyses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own shopping analyses" ON shopping_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shopping analyses" ON shopping_analyses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shopping analyses" ON shopping_analyses
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for wardrobe_gaps
CREATE POLICY "Users can view own wardrobe gaps" ON wardrobe_gaps
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own wardrobe gaps" ON wardrobe_gaps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wardrobe gaps" ON wardrobe_gaps
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wardrobe gaps" ON wardrobe_gaps
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for shopping_wishlists
CREATE POLICY "Users can view own wishlists" ON shopping_wishlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own wishlists" ON shopping_wishlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wishlists" ON shopping_wishlists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlists" ON shopping_wishlists
  FOR DELETE USING (auth.uid() = user_id);