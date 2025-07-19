-- Migration: Add Progression System Support
-- Date: 2025-01-20
-- Description: Adds age bracket support and completed brackets tracking

-- First, modify user_id column to support both UUIDs and guest IDs
DO $$ 
BEGIN
    -- Drop existing RLS policies that depend on user_id column
    DROP POLICY IF EXISTS "Users can view their own level attempts" ON level_attempts;
    DROP POLICY IF EXISTS "Users can insert their own level attempts" ON level_attempts;
    DROP POLICY IF EXISTS "Users can update their own level attempts" ON level_attempts;
    
    -- Drop the foreign key constraint temporarily
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'level_attempts_user_id_fkey' 
               AND table_name = 'level_attempts') THEN
        ALTER TABLE level_attempts DROP CONSTRAINT level_attempts_user_id_fkey;
    END IF;
    
    -- Change user_id column type to TEXT to support guest IDs
    ALTER TABLE level_attempts ALTER COLUMN user_id TYPE TEXT;
    
    -- Recreate RLS policies with TEXT-compatible logic
    CREATE POLICY "Users can view their own level attempts" ON level_attempts
        FOR SELECT USING (auth.uid()::text = user_id OR user_id LIKE 'guest_%');
        
    CREATE POLICY "Users can insert their own level attempts" ON level_attempts
        FOR INSERT WITH CHECK (auth.uid()::text = user_id OR user_id LIKE 'guest_%');
        
    CREATE POLICY "Users can update their own level attempts" ON level_attempts
        FOR UPDATE USING (auth.uid()::text = user_id OR user_id LIKE 'guest_%');
END $$;

-- Add age_bracket to level_attempts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'level_attempts' AND column_name = 'age_bracket') THEN
        ALTER TABLE level_attempts ADD COLUMN age_bracket TEXT;
    END IF;
END $$;

-- Add passed column to level_attempts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'level_attempts' AND column_name = 'passed') THEN
        ALTER TABLE level_attempts ADD COLUMN passed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add completed_brackets to user_progress table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_progress' AND column_name = 'completed_brackets') THEN
        ALTER TABLE user_progress ADD COLUMN completed_brackets TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- Create index for age_bracket queries
CREATE INDEX IF NOT EXISTS idx_level_attempts_age_bracket ON level_attempts(age_bracket, level_id, score DESC);

-- Create index for completed_brackets queries
CREATE INDEX IF NOT EXISTS idx_user_progress_completed_brackets ON user_progress USING GIN(completed_brackets);

-- RLS policies have already been recreated above with proper guest user support

-- Add function to track bracket completion
CREATE OR REPLACE FUNCTION check_bracket_completion(user_id_param UUID, age_bracket_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    completed_levels INTEGER;
    bracket_complete BOOLEAN;
BEGIN
    -- Count completed levels in the bracket (passed = true)
    SELECT COUNT(*) INTO completed_levels
    FROM level_attempts
    WHERE user_id = user_id_param 
      AND age_bracket = age_bracket_param 
      AND passed = true
      AND level_id IN (
          SELECT DISTINCT level_id 
          FROM level_attempts 
          WHERE age_bracket = age_bracket_param
      );
    
    -- Check if all 3 levels are completed
    bracket_complete := completed_levels >= 3;
    
    -- Update user_progress if bracket is completed
    IF bracket_complete THEN
        UPDATE user_progress 
        SET completed_brackets = array_append(
            COALESCE(completed_brackets, '{}'), 
            age_bracket_param
        )
        WHERE user_id = user_id_param 
          AND NOT (age_bracket_param = ANY(COALESCE(completed_brackets, '{}')));
    END IF;
    
    RETURN bracket_complete;
END;
$$ LANGUAGE plpgsql; 