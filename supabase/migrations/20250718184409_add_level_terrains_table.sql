-- Create level_terrains table for storing predefined terrain configurations
CREATE TABLE level_terrains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level_id INTEGER NOT NULL,
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    terrain_data JSONB NOT NULL,
    terrain_config JSONB DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_level_terrains_level_id ON level_terrains(level_id);
CREATE INDEX idx_level_terrains_assignment_id ON level_terrains(assignment_id);
CREATE INDEX idx_level_terrains_is_default ON level_terrains(is_default) WHERE is_default = true;

-- Create partial unique index to ensure only one default terrain per level
CREATE UNIQUE INDEX idx_level_terrains_default_unique ON level_terrains(level_id) WHERE is_default = true;

-- Enable Row Level Security
ALTER TABLE level_terrains ENABLE ROW LEVEL SECURITY;

-- RLS Policies - terrain configurations are publicly readable but only admins can modify
CREATE POLICY "Anyone can read level terrains" ON level_terrains
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create level terrains" ON level_terrains
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their level terrains" ON level_terrains
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete their level terrains" ON level_terrains
    FOR DELETE USING (auth.uid() = created_by);

-- Add updated_at trigger
CREATE TRIGGER update_level_terrains_updated_at BEFORE UPDATE ON level_terrains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default terrain configurations for existing levels
INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default) 
SELECT 
    1,
    id,
    'Foundation Preparation - Default Terrain',
    'Flat terrain with gentle undulations suitable for foundation work (40×40 yards)',
    '{"pattern": "flat", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.2}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.4}, {"name": "Clay", "depth": 2.33, "hardness": 0.7}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.8}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.1, "pattern": "flat", "units": "yards"}',
    true
FROM assignments WHERE name = 'Foundation Preparation';

INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default)
SELECT 
    2,
    id,
    'Drainage Channel - Default Terrain',
    'Gently sloped terrain with natural drainage patterns (40×40 yards)',
    '{"pattern": "gentle_slope", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.2}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.4}, {"name": "Clay", "depth": 2.33, "hardness": 0.7}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.8}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.17, "pattern": "gentle_slope", "water_source": {"x": -20, "z": 0}, "units": "yards"}',
    true
FROM assignments WHERE name = 'Drainage Channel';

INSERT INTO level_terrains (level_id, assignment_id, name, description, terrain_data, terrain_config, is_default)
SELECT 
    3,
    id,
    'Site Development - Default Terrain',
    'Rolling terrain with varied elevations for complex site development (40×40 yards)',
    '{"pattern": "rolling", "vertices": null, "parameters": {"width": 120, "height": 120, "widthSegments": 32, "heightSegments": 32}, "materialLayers": [{"name": "Topsoil", "depth": 0.08, "hardness": 0.2}, {"name": "Subsoil", "depth": 0.92, "hardness": 0.4}, {"name": "Clay", "depth": 2.33, "hardness": 0.7}, {"name": "Deep Soil", "depth": 3.33, "hardness": 0.8}, {"name": "Rock", "depth": 1.67, "hardness": 1.0}]}',
    '{"width": 120, "height": 120, "initial_roughness": 0.27, "pattern": "rolling", "units": "yards"}',
    true
FROM assignments WHERE name = 'Site Development';

