-- Add missing is_ready column to lobby_players table
-- This column is needed for the competitive lobby ready system

DO $$ 
BEGIN
    -- Add is_ready column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'lobby_players' AND column_name = 'is_ready') THEN
        ALTER TABLE lobby_players ADD COLUMN is_ready BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create index for ready state queries
CREATE INDEX IF NOT EXISTS idx_lobby_players_ready ON lobby_players(lobby_id, is_ready); 