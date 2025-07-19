-- Fix lobby system - add missing is_ready column and ensure policies work
-- Migration: 20250122_02 (unique timestamp)

-- Ensure is_ready column exists in lobby_players
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'lobby_players' AND column_name = 'is_ready') THEN
        ALTER TABLE lobby_players ADD COLUMN is_ready BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added is_ready column to lobby_players table';
    ELSE
        RAISE NOTICE 'is_ready column already exists in lobby_players table';
    END IF;
END $$;

-- Create index for ready state queries if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_lobby_players_ready ON lobby_players(lobby_id, is_ready);

-- Ensure competitive lobbies and lobby players have proper RLS policies
DO $$
BEGIN
    -- Drop and recreate competitive lobby policies to ensure they exist
    DROP POLICY IF EXISTS "Allow all operations on competitive_lobbies" ON competitive_lobbies;
    DROP POLICY IF EXISTS "Allow all operations on lobby_players" ON lobby_players;
    
    CREATE POLICY "Allow all operations on competitive_lobbies" ON competitive_lobbies FOR ALL USING (true);
    CREATE POLICY "Allow all operations on lobby_players" ON lobby_players FOR ALL USING (true);
    
    RAISE NOTICE 'Competitive lobby policies configured successfully';
END $$; 