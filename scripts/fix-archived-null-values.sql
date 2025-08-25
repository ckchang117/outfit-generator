-- Fix NULL archived values in clothing_items table
-- This script sets archived = false for any items where archived is currently NULL

-- Update existing NULL archived values to false
UPDATE clothing_items 
SET archived = false 
WHERE archived IS NULL;

-- Verify the update worked
SELECT 
  COUNT(*) as total_items,
  COUNT(CASE WHEN archived = true THEN 1 END) as archived_items,
  COUNT(CASE WHEN archived = false THEN 1 END) as active_items,
  COUNT(CASE WHEN archived IS NULL THEN 1 END) as null_archived_items
FROM clothing_items;

-- This query should show:
-- - total_items: total number of clothing items
-- - archived_items: items marked as archived
-- - active_items: items marked as active
-- - null_archived_items: should be 0 after running the UPDATE