-- Update terrain dimensions from 100x100 to 120x120 feet (40x40 yards)
-- Update descriptions to reflect the new dimensions

UPDATE level_terrains 
SET 
  description = CASE 
    WHEN level_id = 1 THEN 'Flat terrain with gentle undulations suitable for foundation work (40×40 yards)'
    WHEN level_id = 2 THEN 'Gently sloped terrain with natural drainage patterns (40×40 yards)'
    WHEN level_id = 3 THEN 'Rolling terrain with varied elevations for complex site development (40×40 yards)'
    ELSE description
  END,
  terrain_data = jsonb_set(
    jsonb_set(
      terrain_data,
      '{parameters,width}', 
      '120'::jsonb  -- Update width from 100 to 120 feet (40 yards)
    ),
    '{parameters,height}', 
    '120'::jsonb  -- Update height from 100 to 120 feet (40 yards)
  ),
  terrain_config = jsonb_set(
    jsonb_set(
      terrain_config,
      '{width}',
      '120'::jsonb  -- Update config width from 100 to 120 feet
    ),
    '{height}',
    '120'::jsonb  -- Update config height from 100 to 120 feet  
  )
WHERE level_id IN (1, 2, 3) AND is_default = true; 