-- Migration: Add Level System for Gamification
-- Date: 2025-01-18
-- Description: Creates level_attempts table and enhances user_progress for competitive gameplay

-- Create level_attempts table for comprehensive attempt tracking
CREATE TABLE level_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    level_id TEXT NOT NULL,           -- Assignment ID used as level ID
    level_version INTEGER DEFAULT 1,
    score INTEGER NOT NULL,
    objective_points INTEGER,
    net_zero_points INTEGER, 
    operations_points INTEGER,
    operations_count INTEGER,
    ideal_operations INTEGER,
    net_volume DECIMAL,
    duration_seconds INTEGER,
    is_practice BOOLEAN DEFAULT true,
    server_validated BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unlocked_levels to existing user_progress table
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS unlocked_levels INTEGER[] DEFAULT '{1}';

-- Create optimized indexes for leaderboards and queries
CREATE INDEX idx_level_attempts_leaderboard ON level_attempts(level_id, score DESC, is_practice);
CREATE INDEX idx_level_attempts_user ON level_attempts(user_id, completed_at);
CREATE INDEX idx_level_attempts_level_version ON level_attempts(level_id, level_version);
CREATE INDEX idx_level_attempts_competitive ON level_attempts(level_id, is_practice, score DESC) WHERE is_practice = false;

-- Enable Row Level Security
ALTER TABLE level_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for level_attempts
CREATE POLICY "Users can view their own level attempts" ON level_attempts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own level attempts" ON level_attempts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view competitive leaderboards" ON level_attempts
    FOR SELECT USING (is_practice = false);

-- Create updated_at trigger function for level_attempts
CREATE TRIGGER update_level_attempts_updated_at 
BEFORE UPDATE ON level_attempts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT SELECT, INSERT ON level_attempts TO authenticated;
GRANT SELECT, INSERT ON level_attempts TO anon;

-- Add comments for documentation
COMMENT ON TABLE level_attempts IS 'Tracks all level completion attempts with detailed scoring breakdown';
COMMENT ON COLUMN level_attempts.level_id IS 'Assignment ID used as level identifier';
COMMENT ON COLUMN level_attempts.is_practice IS 'True for practice mode, false for competitive mode';
COMMENT ON COLUMN level_attempts.server_validated IS 'Whether score was validated server-side';
COMMENT ON COLUMN level_attempts.operations_count IS 'Number of terrain modifications made';
COMMENT ON COLUMN level_attempts.ideal_operations IS 'Par count for operations efficiency calculation'; 