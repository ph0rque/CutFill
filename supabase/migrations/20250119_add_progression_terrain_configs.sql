-- Add terrain configurations for progression system assignments
-- This migration adds terrain data for kids, teens, and adults level assignments

-- First, add the progression assignments to the assignments table
-- Note: Only inserting columns that exist in the current schema
INSERT INTO assignments (name, description, difficulty_level, target_tolerance, objectives, terrain_config)
VALUES 
-- Kids assignments
('🏠 Build a Sandbox', 'Level the ground to create a perfect sandbox for kids to play!', 1, 1.5, '[{"id": "level_sandbox", "type": "level_area", "description": "Make a flat 10×10 yard area for the sandbox", "target": {"x": 0, "z": 0, "width": 30, "height": 30, "elevation": 0}, "tolerance": 1.5, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "flat"}'),

('🌊 Make a Small Creek', 'Dig a gentle creek that water can flow through!', 2, 0.5, '[{"id": "dig_creek", "type": "excavate_channel", "description": "Create a shallow creek from point A to point B", "target": {"startX": -15, "startZ": -10, "endX": 15, "endZ": 10, "depth": 0.75, "width": 3}, "tolerance": 0.5, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rolling"}'),

('🛤️ Build a Fun Path', 'Create a smooth path that connects two areas!', 3, 0.75, '[{"id": "build_path", "type": "level_path", "description": "Create a flat path connecting the playground areas", "target": {"points": [{"x": -15, "z": 0}, {"x": 0, "z": 0}, {"x": 15, "z": 0}], "width": 6, "maxGrade": 0.05}, "tolerance": 0.75, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rolling"}'),

-- Teens assignments  
('🏗️ Foundation Engineering', 'Engineer a precise foundation pad using real construction tolerances', 4, 0.25, '[{"id": "foundation_pad", "type": "level_area", "description": "Create a 20×20 yard foundation pad with ±3 inch tolerance", "target": {"x": 0, "z": 0, "width": 60, "height": 60, "elevation": 0}, "tolerance": 0.25, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rolling"}'),

('🌊 Hydraulic Engineering', 'Design a drainage system with proper hydraulic principles', 5, 0.2, '[{"id": "drainage_system", "type": "excavate_channel", "description": "Create a drainage channel with 2% grade and retention pond", "target": {"startX": -20, "startZ": -15, "endX": 15, "endZ": 20, "depth": 1.5, "width": 6, "grade": 0.02}, "tolerance": 0.2, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rough"}'),

('🛣️ Transportation Engineering', 'Design a road section meeting transportation standards', 6, 0.15, '[{"id": "road_section", "type": "grade_road", "description": "Build a road section with proper crown and grade", "target": {"centerline": [{"x": -20, "z": 0}, {"x": 20, "z": 0}], "width": 24, "crown": 0.02, "maxGrade": 0.06}, "tolerance": 0.15, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rolling"}'),

-- Adults assignments
('🏢 Commercial Foundation', 'Design and execute a complex commercial foundation system', 7, 0.08, '[{"id": "commercial_foundation", "type": "level_area", "description": "Create multi-level foundation system with precise elevations", "target": {"areas": [{"x": -10, "z": -10, "width": 20, "height": 20, "elevation": 0}, {"x": 10, "z": 10, "width": 20, "height": 20, "elevation": -0.5}], "tolerance": 0.08}, "tolerance": 0.08, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rolling"}'),

('🌊 Stormwater Management', 'Design a comprehensive stormwater management system', 8, 0.05, '[{"id": "stormwater_system", "type": "complex_drainage", "description": "Create integrated stormwater system with bioswales and detention", "target": {"channels": [{"start": {"x": -25, "z": -20}, "end": {"x": 0, "z": 0}, "depth": 2, "width": 8}, {"start": {"x": 0, "z": 0}, "end": {"x": 25, "z": 20}, "depth": 1.5, "width": 6}], "bioswale": {"x": 0, "z": 0, "width": 12, "length": 20, "depth": 1}}, "tolerance": 0.05, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rough"}'),

('🛣️ Highway Construction', 'Execute advanced highway construction with complex geometry', 9, 0.03, '[{"id": "highway_section", "type": "complex_road", "description": "Build highway section with superelevation and transition zones", "target": {"alignment": [{"x": -30, "z": -10}, {"x": -10, "z": 0}, {"x": 10, "z": 0}, {"x": 30, "z": 10}], "width": 36, "superelevation": 0.04, "transitions": [{"station": 0, "rate": 0}, {"station": 100, "rate": 0.04}]}, "tolerance": 0.03, "weight": 1.0, "completed": false, "score": 0}]', '{"width": 40, "height": 40, "initialTerrain": "rolling"}');

-- Now insert terrain configurations for all progression assignments
-- Kids Level 1: 🏠 Build a Sandbox (flat terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    1,
    id,
    'Sandbox - Flat Terrain',
    'Simple flat terrain perfect for learning basic leveling (40×40 yards)',
    '{"pattern": "flat", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.15}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.3}, {"name": "Clay", "depth": 2.33, "hardness": 0.6}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.75}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.05, "pattern": "flat", "units": "yards"}',
    false
FROM assignments WHERE name = '🏠 Build a Sandbox';

-- Kids Level 2: 🌊 Make a Small Creek (rolling terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    2,
    id,
    'Creek - Gentle Rolling Terrain',
    'Gently rolling terrain for creek excavation (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.15}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.3}, {"name": "Clay", "depth": 2.33, "hardness": 0.6}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.75}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.12, "pattern": "rolling", "units": "yards"}',
    false
FROM assignments WHERE name = '🌊 Make a Small Creek';

-- Kids Level 3: 🛤️ Build a Fun Path (rolling terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    3,
    id,
    'Path - Rolling Terrain',
    'Rolling terrain for path construction (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.15}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.3}, {"name": "Clay", "depth": 2.33, "hardness": 0.6}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.75}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.15, "pattern": "rolling", "units": "yards"}',
    false
FROM assignments WHERE name = '🛤️ Build a Fun Path';

-- Teens Level 1: 🏗️ Foundation Engineering (rolling terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    1,
    id,
    'Foundation Engineering - Rolling Terrain',
    'Moderate rolling terrain for engineering foundations (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.2}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.4}, {"name": "Clay", "depth": 2.33, "hardness": 0.7}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.8}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.18, "pattern": "rolling", "units": "yards"}',
    false
FROM assignments WHERE name = '🏗️ Foundation Engineering';

-- Teens Level 2: 🌊 Hydraulic Engineering (rough terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    2,
    id,
    'Hydraulic Engineering - Rough Terrain',
    'Challenging rough terrain for hydraulic engineering (40×40 yards)',
    '{"pattern": "rough", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.2}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.4}, {"name": "Clay", "depth": 2.33, "hardness": 0.7}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.8}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.25, "pattern": "rough", "units": "yards"}',
    false
FROM assignments WHERE name = '🌊 Hydraulic Engineering';

-- Teens Level 3: 🛣️ Transportation Engineering (rolling terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    3,
    id,
    'Transportation Engineering - Rolling Terrain',
    'Complex rolling terrain for transportation engineering (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.2}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.4}, {"name": "Clay", "depth": 2.33, "hardness": 0.7}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.8}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.22, "pattern": "rolling", "units": "yards"}',
    false
FROM assignments WHERE name = '🛣️ Transportation Engineering';

-- Adults Level 1: 🏢 Commercial Foundation (rolling terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    1,
    id,
    'Commercial Foundation - Rolling Terrain',
    'Professional-grade rolling terrain for commercial foundations (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.25}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.5}, {"name": "Clay", "depth": 2.33, "hardness": 0.8}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.9}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.20, "pattern": "rolling", "units": "yards"}',
    false
FROM assignments WHERE name = '🏢 Commercial Foundation';

-- Adults Level 2: 🌊 Stormwater Management (rough terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    2,
    id,
    'Stormwater Management - Rough Terrain',
    'Complex rough terrain for stormwater management (40×40 yards)',
    '{"pattern": "rough", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.25}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.5}, {"name": "Clay", "depth": 2.33, "hardness": 0.8}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.9}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.30, "pattern": "rough", "units": "yards"}',
    false
FROM assignments WHERE name = '🌊 Stormwater Management';

-- Adults Level 3: 🛣️ Highway Construction (rolling terrain)
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    3,
    id,
    'Highway Construction - Rolling Terrain',
    'Advanced rolling terrain for highway construction (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.25}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.5}, {"name": "Clay", "depth": 2.33, "hardness": 0.8}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.9}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.25, "pattern": "rolling", "units": "yards"}',
    false
FROM assignments WHERE name = '🛣️ Highway Construction'; 