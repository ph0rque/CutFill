-- Fix RLS policies for guest users and user_progress table
-- This migration resolves 401/406 errors for guest user access

-- First, check current RLS policies and fix user_progress access
DO $$
BEGIN
    -- Drop existing problematic policies for user_progress
    DROP POLICY IF EXISTS "Users can view their own progress" ON user_progress;
    DROP POLICY IF EXISTS "Users can insert their own progress" ON user_progress;
    DROP POLICY IF EXISTS "Users can update their own progress" ON user_progress;
    DROP POLICY IF EXISTS "Anonymous users can access guest progress" ON user_progress;
    
    -- Create new comprehensive policies that properly handle guest users
    CREATE POLICY "Allow access to own progress" ON user_progress
        FOR ALL USING (
            -- Allow if authenticated user matches user_id
            (auth.uid() IS NOT NULL AND auth.uid()::text = user_id) OR
            -- Allow if email matches user_id (for email-based auth)
            (auth.email() IS NOT NULL AND auth.email() = user_id) OR
            -- Allow any guest user to access any guest progress
            (user_id LIKE 'guest%') OR
            -- Allow the specific 'guest' user_id
            (user_id = 'guest')
        );
    
    -- Create separate policy for inserts to be more permissive
    CREATE POLICY "Allow progress creation" ON user_progress
        FOR INSERT WITH CHECK (
            -- Allow authenticated users to create their own progress
            (auth.uid() IS NOT NULL AND auth.uid()::text = user_id) OR
            -- Allow email-based creation
            (auth.email() IS NOT NULL AND auth.email() = user_id) OR
            -- Allow any guest user creation
            (user_id LIKE 'guest%') OR
            -- Allow the specific 'guest' user_id
            (user_id = 'guest') OR
            -- Allow anonymous users to create guest progress
            (auth.uid() IS NULL AND user_id LIKE 'guest%') OR
            (auth.uid() IS NULL AND user_id = 'guest')
        );
END $$;

-- Ensure the user_progress table allows anonymous access
GRANT SELECT, INSERT, UPDATE ON user_progress TO anon;
GRANT USAGE ON SCHEMA public TO anon;

-- Also fix any potential issues with the assignments table for guest access
DO $$
BEGIN
    -- Check if assignments table needs guest access policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assignments') THEN
        -- Drop existing restrictive policies if they exist
        DROP POLICY IF EXISTS "Assignments are publicly readable" ON assignments;
        
        -- Create permissive policy for assignments
        CREATE POLICY "Allow all access to assignments" ON assignments FOR ALL USING (true);
        
        -- Grant permissions to anonymous users
        GRANT SELECT ON assignments TO anon;
    END IF;
END $$;

-- Fix level_attempts table for guest users if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'level_attempts') THEN
        -- Drop existing restrictive policies
        DROP POLICY IF EXISTS "Users can view their own level attempts" ON level_attempts;
        DROP POLICY IF EXISTS "Users can insert their own level attempts" ON level_attempts;
        DROP POLICY IF EXISTS "Users can update their own level attempts" ON level_attempts;
        DROP POLICY IF EXISTS "Users can view competitive leaderboards" ON level_attempts;
        
        -- Create guest-friendly policies
        CREATE POLICY "Allow access to own level attempts" ON level_attempts
            FOR ALL USING (
                (auth.uid() IS NOT NULL AND auth.uid()::text = user_id) OR
                (auth.email() IS NOT NULL AND auth.email() = user_id) OR
                (user_id LIKE 'guest%') OR
                (user_id = 'guest') OR
                (is_practice = false) -- Allow viewing competitive leaderboards
            );
        
        CREATE POLICY "Allow level attempt creation" ON level_attempts
            FOR INSERT WITH CHECK (
                (auth.uid() IS NOT NULL AND auth.uid()::text = user_id) OR
                (auth.email() IS NOT NULL AND auth.email() = user_id) OR
                (user_id LIKE 'guest%') OR
                (user_id = 'guest') OR
                (auth.uid() IS NULL AND user_id LIKE 'guest%') OR
                (auth.uid() IS NULL AND user_id = 'guest')
            );
        
        -- Grant permissions
        GRANT SELECT, INSERT, UPDATE ON level_attempts TO anon;
    END IF;
END $$;

-- Ensure level_terrains is accessible for terrain loading
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'level_terrains') THEN
        -- Drop existing policies if any
        DROP POLICY IF EXISTS "Anyone can read level terrains" ON level_terrains;
        
        -- Create permissive read policy
        CREATE POLICY "Allow all terrain access" ON level_terrains FOR ALL USING (true);
        
        -- Grant permissions
        GRANT SELECT ON level_terrains TO anon;
    END IF;
END $$;

-- Create a function to safely initialize guest progress if it doesn't exist
CREATE OR REPLACE FUNCTION get_or_create_guest_progress(guest_user_id TEXT)
RETURNS SETOF user_progress AS $$
DECLARE
    progress_record user_progress%ROWTYPE;
BEGIN
    -- Try to get existing progress
    SELECT * INTO progress_record FROM user_progress WHERE user_id = guest_user_id;
    
    -- If not found, create it
    IF NOT FOUND THEN
        INSERT INTO user_progress (
            user_id, 
            level, 
            experience, 
            assignments_completed,
            total_volume_moved,
            tool_usage_stats,
            accuracy_history,
            achievements,
            preferences
        ) VALUES (
            guest_user_id,
            1,
            0,
            0,
            0.0,
            '{}',
            '[]',
            '[]',
            '{"preferredTools": ["excavator"], "difficultyLevel": "beginner", "notifications": true, "autoSave": true, "measurementUnits": "yards", "themes": ["default"]}'
        ) RETURNING * INTO progress_record;
    END IF;
    
    RETURN NEXT progress_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_or_create_guest_progress(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_or_create_guest_progress(TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_or_create_guest_progress(TEXT) IS 'Safely retrieves or creates guest user progress record'; 