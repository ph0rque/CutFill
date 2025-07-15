-- Drop existing table if it exists
DROP TABLE IF EXISTS user_progress CASCADE;

-- Create user_progress table with correct schema
CREATE TABLE user_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    level INTEGER DEFAULT 1 NOT NULL,
    experience INTEGER DEFAULT 0 NOT NULL,
    assignments_completed INTEGER DEFAULT 0 NOT NULL,
    total_volume_moved DECIMAL(12, 3) DEFAULT 0.0 NOT NULL,
    tool_usage_stats JSONB DEFAULT '{}' NOT NULL,
    accuracy_history JSONB DEFAULT '[]' NOT NULL,
    current_streak INTEGER DEFAULT 0 NOT NULL,
    longest_streak INTEGER DEFAULT 0 NOT NULL,
    achievements JSONB DEFAULT '[]' NOT NULL,
    preferences JSONB DEFAULT '{}' NOT NULL,
    total_time_spent_minutes INTEGER DEFAULT 0 NOT NULL,
    last_active_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index on user_id for faster lookups
CREATE INDEX idx_user_progress_user_id ON user_progress(user_id);

-- Create unique constraint on user_id to prevent duplicate progress records
ALTER TABLE user_progress ADD CONSTRAINT unique_user_progress UNIQUE (user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- Create policies for user_progress table
-- Allow authenticated users to access their own progress
CREATE POLICY "Users can view their own progress" ON user_progress
    FOR SELECT USING (
        auth.uid()::text = user_id OR 
        auth.email() = user_id OR
        user_id LIKE 'guest_%'
    );

CREATE POLICY "Users can insert their own progress" ON user_progress
    FOR INSERT WITH CHECK (
        auth.uid()::text = user_id OR 
        auth.email() = user_id OR
        user_id LIKE 'guest_%'
    );

CREATE POLICY "Users can update their own progress" ON user_progress
    FOR UPDATE USING (
        auth.uid()::text = user_id OR 
        auth.email() = user_id OR
        user_id LIKE 'guest_%'
    );

-- Allow anonymous users to access guest progress
CREATE POLICY "Anonymous users can access guest progress" ON user_progress
    FOR ALL USING (user_id LIKE 'guest_%');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER trigger_user_progress_updated_at
    BEFORE UPDATE ON user_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_user_progress_updated_at();

-- Create function to calculate user level from experience
CREATE OR REPLACE FUNCTION calculate_user_level(exp INTEGER)
RETURNS INTEGER AS $$
DECLARE
    level_thresholds INTEGER[] := ARRAY[0, 500, 1200, 2000, 3000, 4500, 6500, 9000, 12000, 16000];
    level INTEGER := 1;
    i INTEGER;
BEGIN
    FOR i IN REVERSE array_length(level_thresholds, 1)..1 LOOP
        IF exp >= level_thresholds[i] THEN
            level := i;
            EXIT;
        END IF;
    END LOOP;
    RETURN level;
END;
$$ LANGUAGE plpgsql;

-- Create function to automatically update level when experience changes
CREATE OR REPLACE FUNCTION update_user_level()
RETURNS TRIGGER AS $$
BEGIN
    NEW.level = calculate_user_level(NEW.experience);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update level
CREATE TRIGGER trigger_user_level_update
    BEFORE INSERT OR UPDATE ON user_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_user_level();

-- Add some sample data for testing
INSERT INTO user_progress (user_id, experience, assignments_completed, total_volume_moved, tool_usage_stats, achievements, preferences)
VALUES 
    ('guest', 0, 0, 0.0, '{}', '[]', '{"preferredTools": ["excavator"], "difficultyLevel": "beginner", "notifications": true, "autoSave": true, "measurementUnits": "metric", "themes": ["default"]}')
ON CONFLICT (user_id) DO NOTHING;

-- Create view for user progress with calculated fields
CREATE VIEW user_progress_view AS
SELECT 
    up.*,
    calculate_user_level(up.experience) as calculated_level,
    CASE 
        WHEN up.accuracy_history::jsonb = '[]'::jsonb THEN 0
        ELSE (
            SELECT AVG(value::numeric)
            FROM jsonb_array_elements_text(up.accuracy_history) as value
        )
    END as average_accuracy,
    jsonb_array_length(up.achievements) as achievement_count
FROM user_progress up;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON user_progress TO authenticated;
GRANT SELECT ON user_progress_view TO authenticated;

-- Grant permissions to anonymous users for guest functionality
GRANT SELECT, INSERT, UPDATE ON user_progress TO anon;
GRANT SELECT ON user_progress_view TO anon; 