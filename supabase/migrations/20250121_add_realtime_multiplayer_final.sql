-- Fixed migration for realtime multiplayer features
-- This migration properly handles existing tables and adds missing columns

-- First, check if game_sessions table has session_id column, add it if missing
DO $$ 
BEGIN
    -- Add session_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'game_sessions' AND column_name = 'session_id') THEN
        ALTER TABLE game_sessions ADD COLUMN session_id TEXT UNIQUE;
        
        -- Populate session_id for existing records
        UPDATE game_sessions SET session_id = 'session_' || id::text WHERE session_id IS NULL;
        
        -- Make session_id NOT NULL after populating
        ALTER TABLE game_sessions ALTER COLUMN session_id SET NOT NULL;
    END IF;
    
    -- Add other missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'game_sessions' AND column_name = 'created_by') THEN
        ALTER TABLE game_sessions ADD COLUMN created_by TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'game_sessions' AND column_name = 'status') THEN
        ALTER TABLE game_sessions ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'game_sessions' AND column_name = 'max_players') THEN
        ALTER TABLE game_sessions ADD COLUMN max_players INTEGER DEFAULT 8;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'game_sessions' AND column_name = 'terrain_config') THEN
        ALTER TABLE game_sessions ADD COLUMN terrain_config JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'game_sessions' AND column_name = 'session_type') THEN
        ALTER TABLE game_sessions ADD COLUMN session_type TEXT DEFAULT 'collaborative';
    END IF;
END $$;

-- Create session_players table
CREATE TABLE IF NOT EXISTS session_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES game_sessions(session_id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_tool TEXT DEFAULT 'excavator',
    status TEXT DEFAULT 'active',
    age_range TEXT,
    cursor_position JSONB,
    UNIQUE(session_id, player_id)
);

-- Create terrain_updates table
CREATE TABLE IF NOT EXISTS terrain_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES game_sessions(session_id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    operation_type TEXT NOT NULL, -- 'cut', 'fill', 'level'
    tool_type TEXT NOT NULL,
    position JSONB NOT NULL,
    area JSONB,
    volume_change NUMERIC,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create player_cursors table
CREATE TABLE IF NOT EXISTS player_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES game_sessions(session_id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    position JSONB NOT NULL,
    tool TEXT DEFAULT 'excavator',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, player_id)
);

-- Create competitive_lobbies table
CREATE TABLE IF NOT EXISTS competitive_lobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id TEXT UNIQUE NOT NULL,
    lobby_name TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    max_players INTEGER DEFAULT 4,
    current_players INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting', -- 'waiting', 'active', 'completed'
    assignment_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create lobby_players table
CREATE TABLE IF NOT EXISTS lobby_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id TEXT REFERENCES competitive_lobbies(lobby_id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    score NUMERIC DEFAULT 0,
    completion_time INTEGER,
    status TEXT DEFAULT 'active',
    UNIQUE(lobby_id, player_id)
);

-- Enable Row Level Security on new tables
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_players ENABLE ROW LEVEL SECURITY;

-- Only enable RLS on game_sessions if it's not already enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'game_sessions' 
        AND c.relrowsecurity = true
    ) THEN
        ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Create policies for public access (adjust as needed for your security requirements)
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Allow all operations on game_sessions" ON game_sessions;
DROP POLICY IF EXISTS "Allow all operations on session_players" ON session_players;
DROP POLICY IF EXISTS "Allow all operations on terrain_updates" ON terrain_updates;
DROP POLICY IF EXISTS "Allow all operations on player_cursors" ON player_cursors;
DROP POLICY IF EXISTS "Allow all operations on competitive_lobbies" ON competitive_lobbies;
DROP POLICY IF EXISTS "Allow all operations on lobby_players" ON lobby_players;

-- Create new policies
CREATE POLICY "Allow all operations on game_sessions" ON game_sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations on session_players" ON session_players FOR ALL USING (true);
CREATE POLICY "Allow all operations on terrain_updates" ON terrain_updates FOR ALL USING (true);
CREATE POLICY "Allow all operations on player_cursors" ON player_cursors FOR ALL USING (true);
CREATE POLICY "Allow all operations on competitive_lobbies" ON competitive_lobbies FOR ALL USING (true);
CREATE POLICY "Allow all operations on lobby_players" ON lobby_players FOR ALL USING (true);

-- Enable realtime subscriptions (only if tables aren't already in publication)
DO $$
BEGIN
    -- Check if tables are already in the publication before adding
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'game_sessions' AND pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'session_players' AND pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE session_players;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'terrain_updates' AND pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE terrain_updates;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'player_cursors' AND pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE player_cursors;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'competitive_lobbies' AND pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE competitive_lobbies;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'lobby_players' AND pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE lobby_players;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_session_players_session_id ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_terrain_updates_session_id ON terrain_updates(session_id);
CREATE INDEX IF NOT EXISTS idx_player_cursors_session_id ON player_cursors(session_id);
CREATE INDEX IF NOT EXISTS idx_lobby_players_lobby_id ON lobby_players(lobby_id);
CREATE INDEX IF NOT EXISTS idx_terrain_updates_timestamp ON terrain_updates(timestamp);
CREATE INDEX IF NOT EXISTS idx_player_cursors_updated_at ON player_cursors(updated_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_session_id ON game_sessions(session_id);

-- Create unique constraint on session_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'game_sessions_session_id_key'
    ) THEN
        ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_session_id_key UNIQUE (session_id);
    END IF;
END $$; 