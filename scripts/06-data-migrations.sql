-- Data Migrations and Fixes
-- This script handles data cleanup and migrations
-- Run after all other scripts

-- Fix NULL archived values in clothing_items table
-- Sets archived = false for any items where archived is currently NULL
UPDATE clothing_items 
SET archived = false 
WHERE archived IS NULL;

-- Fix NULL favorite values in clothing_items table
-- Sets favorite = false for any items where favorite is currently NULL
UPDATE clothing_items 
SET favorite = false 
WHERE favorite IS NULL;

-- Ensure all items have at least an empty photo_urls array
UPDATE clothing_items 
SET photo_urls = '{}'::TEXT[]
WHERE photo_urls IS NULL;

-- Ensure all outfits have at least an empty item_ids array
UPDATE outfits 
SET item_ids = '{}'::UUID[]
WHERE item_ids IS NULL;

-- Convert old photo_url to photo_urls array format if needed
-- This handles migration from single photo to multiple photos
UPDATE clothing_items 
SET photo_urls = ARRAY[photo_url]::TEXT[]
WHERE photo_url IS NOT NULL 
  AND (photo_urls IS NULL OR photo_urls = '{}'::TEXT[]);

-- Verify data integrity
-- This query helps verify the migration worked correctly
SELECT 
  'clothing_items' as table_name,
  COUNT(*) as total_items,
  COUNT(CASE WHEN archived = true THEN 1 END) as archived_items,
  COUNT(CASE WHEN archived = false THEN 1 END) as active_items,
  COUNT(CASE WHEN archived IS NULL THEN 1 END) as null_archived_items,
  COUNT(CASE WHEN favorite = true THEN 1 END) as favorite_items,
  COUNT(CASE WHEN favorite = false THEN 1 END) as non_favorite_items,
  COUNT(CASE WHEN favorite IS NULL THEN 1 END) as null_favorite_items,
  COUNT(CASE WHEN photo_urls IS NULL OR photo_urls = '{}'::TEXT[] THEN 1 END) as items_without_photos,
  COUNT(CASE WHEN array_length(photo_urls, 1) > 0 THEN 1 END) as items_with_photos
FROM clothing_items

UNION ALL

SELECT 
  'outfits' as table_name,
  COUNT(*) as total_items,
  COUNT(CASE WHEN worn = true THEN 1 END) as worn_outfits,
  COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as rated_outfits,
  0 as null_archived_items,
  0 as favorite_items,
  0 as non_favorite_items,
  0 as null_favorite_items,
  COUNT(CASE WHEN item_ids IS NULL OR item_ids = '{}'::UUID[] THEN 1 END) as outfits_without_items,
  COUNT(CASE WHEN array_length(item_ids, 1) > 0 THEN 1 END) as outfits_with_items
FROM outfits;