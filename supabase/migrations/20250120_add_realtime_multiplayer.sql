-- Enable realtime for multiplayer features
-- This migration sets up tables for real-time multiplayer functionality

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    max_players INTEGER DEFAULT 8,
    terrain_config JSONB,
    session_type TEXT DEFAULT 'collaborative'
);

-- Players in sessions
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

-- Real-time terrain updates
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

-- Player cursors for real-time collaboration
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

-- Competitive lobbies
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

-- Players in competitive lobbies
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

-- Enable Row Level Security
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_players ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on game_sessions" ON game_sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations on session_players" ON session_players FOR ALL USING (true);
CREATE POLICY "Allow all operations on terrain_updates" ON terrain_updates FOR ALL USING (true);
CREATE POLICY "Allow all operations on player_cursors" ON player_cursors FOR ALL USING (true);
CREATE POLICY "Allow all operations on competitive_lobbies" ON competitive_lobbies FOR ALL USING (true);
CREATE POLICY "Allow all operations on lobby_players" ON lobby_players FOR ALL USING (true);

-- Enable realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE session_players;
ALTER PUBLICATION supabase_realtime ADD TABLE terrain_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE player_cursors;
ALTER PUBLICATION supabase_realtime ADD TABLE competitive_lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_players;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_session_players_session_id ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_terrain_updates_session_id ON terrain_updates(session_id);
CREATE INDEX IF NOT EXISTS idx_player_cursors_session_id ON player_cursors(session_id);
CREATE INDEX IF NOT EXISTS idx_lobby_players_lobby_id ON lobby_players(lobby_id);
CREATE INDEX IF NOT EXISTS idx_terrain_updates_timestamp ON terrain_updates(timestamp);
CREATE INDEX IF NOT EXISTS idx_player_cursors_updated_at ON player_cursors(updated_at); 