import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface GameSession {
  id: string;
  name: string;
  max_players: number;
  current_players: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TerrainModification {
  id: string;
  session_id: string;
  user_id: string;
  x: number;
  z: number;
  height_change: number;
  tool: string;
  created_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  level: number;
  experience: number;
  assignments_completed: number;
  total_volume_moved: number;
  created_at: string;
  updated_at: string;
}
