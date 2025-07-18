-- Update existing terrain configurations to use yards instead of feet
-- Convert material layer depths from feet to yards (divide by 3)
-- Update descriptions to indicate yard measurements

UPDATE level_terrains 
SET 
  description = CASE 
    WHEN level_id = 1 THEN 'Flat terrain with gentle undulations suitable for foundation work (measurements in yards)'
    WHEN level_id = 2 THEN 'Gently sloped terrain with natural drainage patterns (measurements in yards)'
    WHEN level_id = 3 THEN 'Rolling terrain with varied elevations for complex site development (measurements in yards)'
    ELSE description
  END,
  terrain_data = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            terrain_data,
            '{materialLayers,0,depth}', 
            '0.08'::jsonb  -- 0.25 feet -> 0.08 yards (topsoil)
          ),
          '{materialLayers,1,depth}', 
          '0.92'::jsonb  -- 2.75 feet -> 0.92 yards (subsoil)
        ),
        '{materialLayers,2,depth}', 
        '2.33'::jsonb  -- 7.0 feet -> 2.33 yards (clay)
      ),
      '{materialLayers,3,depth}', 
      '3.33'::jsonb  -- 10.0 feet -> 3.33 yards (deep soil)
    ),
    '{materialLayers,4,depth}', 
    '1.67'::jsonb  -- 5.0 feet -> 1.67 yards (rock)
  ),
  terrain_config = jsonb_set(
    jsonb_set(
      terrain_config,
      '{units}',
      '"yards"'::jsonb
    ),
    '{initial_roughness}',
    CASE 
      WHEN level_id = 1 THEN '0.1'::jsonb   -- 0.3 -> 0.1 (flat)
      WHEN level_id = 2 THEN '0.17'::jsonb  -- 0.5 -> 0.17 (gentle slope) 
      WHEN level_id = 3 THEN '0.27'::jsonb  -- 0.8 -> 0.27 (rolling)
      ELSE terrain_config->'initial_roughness'
    END
  )
WHERE level_id IN (1, 2, 3); 