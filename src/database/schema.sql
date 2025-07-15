-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (extends auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_progress table
CREATE TABLE user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    assignments_completed INTEGER DEFAULT 0,
    total_volume_moved DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create game_sessions table
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    max_players INTEGER DEFAULT 4,
    current_players INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    session_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create terrain_modifications table
CREATE TABLE terrain_modifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    x DECIMAL NOT NULL,
    z DECIMAL NOT NULL,
    height_change DECIMAL NOT NULL,
    tool TEXT NOT NULL DEFAULT 'excavator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create session_participants table (many-to-many)
CREATE TABLE session_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(session_id, user_id)
);

-- Create assignments table
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    difficulty_level INTEGER DEFAULT 1,
    target_tolerance DECIMAL DEFAULT 0.05,
    terrain_config JSONB DEFAULT '{}',
    objectives JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_assignments table (completion tracking)
CREATE TABLE user_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ,
    score INTEGER,
    volume_data JSONB DEFAULT '{}',
    completion_time INTEGER, -- in seconds
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, assignment_id)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_sessions_updated_at BEFORE UPDATE ON game_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_assignments_updated_at BEFORE UPDATE ON user_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_terrain_modifications_session_id ON terrain_modifications(session_id);
CREATE INDEX idx_terrain_modifications_user_id ON terrain_modifications(user_id);
CREATE INDEX idx_terrain_modifications_created_at ON terrain_modifications(created_at);
CREATE INDEX idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX idx_session_participants_user_id ON session_participants(user_id);
CREATE INDEX idx_user_assignments_user_id ON user_assignments(user_id);
CREATE INDEX idx_user_assignments_assignment_id ON user_assignments(assignment_id);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assignments ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile and other users' public info
CREATE POLICY "Users can read own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can read public profiles" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- User progress policies
CREATE POLICY "Users can read own progress" ON user_progress
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own progress" ON user_progress
    FOR ALL USING (auth.uid() = user_id);

-- Game sessions policies
CREATE POLICY "Users can read active sessions" ON game_sessions
    FOR SELECT USING (is_active = true);

CREATE POLICY "Users can create sessions" ON game_sessions
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Session creators can update sessions" ON game_sessions
    FOR UPDATE USING (auth.uid() = created_by);

-- Terrain modifications policies
CREATE POLICY "Users can read terrain modifications" ON terrain_modifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM session_participants sp
            WHERE sp.session_id = terrain_modifications.session_id
            AND sp.user_id = auth.uid()
            AND sp.is_active = true
        )
    );

CREATE POLICY "Users can create terrain modifications" ON terrain_modifications
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM session_participants sp
            WHERE sp.session_id = terrain_modifications.session_id
            AND sp.user_id = auth.uid()
            AND sp.is_active = true
        )
    );

-- Session participants policies
CREATE POLICY "Users can read session participants" ON session_participants
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM session_participants sp
            WHERE sp.session_id = session_participants.session_id
            AND sp.user_id = auth.uid()
            AND sp.is_active = true
        )
    );

CREATE POLICY "Users can join sessions" ON session_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation" ON session_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- User assignments policies
CREATE POLICY "Users can read own assignments" ON user_assignments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own assignments" ON user_assignments
    FOR ALL USING (auth.uid() = user_id);

-- Assignments are publicly readable
CREATE POLICY "Anyone can read assignments" ON assignments
    FOR SELECT USING (true);

-- Insert some sample assignments
INSERT INTO assignments (name, description, difficulty_level, target_tolerance, terrain_config, objectives) VALUES
(
    'Foundation Preparation',
    'Level a 10x10 area within 1-foot elevation variance for building foundation',
    1,
    0.05,
    '{"width": 50, "height": 50, "initial_roughness": 0.5}',
    '[{"type": "level_area", "x": 0, "z": 0, "width": 10, "height": 10, "tolerance": 0.3}]'
),
(
    'Drainage Channel',
    'Create a water drainage channel following the marked path',
    2,
    0.03,
    '{"width": 60, "height": 60, "initial_roughness": 0.7, "water_source": {"x": -20, "z": 0}}',
    '[{"type": "create_channel", "path": [{"x": -20, "z": 0}, {"x": 0, "z": 0}, {"x": 20, "z": 0}], "depth": 2}]'
),
(
    'Site Development',
    'Prepare multiple building sites with proper grading and drainage',
    3,
    0.02,
    '{"width": 80, "height": 80, "initial_roughness": 1.0}',
    '[{"type": "multiple_sites", "sites": [{"x": -15, "z": -15, "width": 12, "height": 12}, {"x": 15, "z": 15, "width": 8, "height": 8}]}]'
); 