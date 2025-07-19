import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Terrain } from './terrain';

export interface PlayerData {
  id: string;
  name: string;
  joinedAt: number;
  lastActiveAt: number;
  currentTool: string;
  status: string;
  ageRange?: string;
  cursorPosition?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface GameSession {
  sessionId: string;
  createdBy?: string;
  status: string;
  maxPlayers: number;
  terrainConfig?: any;
  sessionType: string;
  players: PlayerData[];
}

export interface TerrainUpdate {
  sessionId: string;
  playerId: string;
  operationType: 'cut' | 'fill' | 'level';
  toolType: string;
  position: { x: number; y: number; z: number };
  area?: any;
  volumeChange?: number;
  timestamp: string;
}

export interface PlayerCursor {
  sessionId: string;
  playerId: string;
  playerName: string;
  position: { x: number; y: number; z: number };
  tool: string;
  updatedAt: string;
}

export class SupabaseMultiplayer {
  private terrain: Terrain;
  private currentSessionId: string | null = null;
  private currentPlayerId: string | null = null;
  private currentPlayerName: string | null = null;
  private sessionChannel: RealtimeChannel | null = null;
  private playersChannel: RealtimeChannel | null = null;
  private terrainChannel: RealtimeChannel | null = null;
  private cursorsChannel: RealtimeChannel | null = null;
  
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.currentPlayerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Event system to match Socket.io API
  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler?: Function) {
    if (!this.eventHandlers.has(event)) return;
    
    const handlers = this.eventHandlers.get(event)!;
    if (handler) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    } else {
      handlers.length = 0;
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  // Create a new game session
  async createSession(options: any = {}) {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { data, error } = await supabase
        .from('game_sessions')
        .insert({
          session_id: sessionId,
          created_by: this.currentPlayerId,
          terrain_config: options.terrainConfig,
          session_type: options.sessionType || 'collaborative',
          max_players: options.maxPlayers || 8
        })
        .select()
        .single();

      if (error) throw error;

      this.currentSessionId = sessionId;
      await this.subscribeToSession(sessionId);
      
      const sessionData = {
        sessionId,
        players: [],
        ...data
      };
      
      this.emit('session-created', { session: sessionData });
      
      return sessionData;
    } catch (error) {
      console.error('Error creating session:', error);
      this.emit('error', { message: 'Failed to create session' });
      throw error;
    }
  }

  // Join an existing session
  async joinSession(sessionId: string, playerName: string, ageRange?: string) {
    try {
      this.currentSessionId = sessionId;
      this.currentPlayerName = playerName;

      // Add player to session
      const { error: playerError } = await supabase
        .from('session_players')
        .upsert({
          session_id: sessionId,
          player_id: this.currentPlayerId,
          player_name: playerName,
          age_range: ageRange,
          last_active_at: new Date().toISOString()
        });

      if (playerError) throw playerError;

      await this.subscribeToSession(sessionId);

      // Get current session data
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      const { data: players } = await supabase
        .from('session_players')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'active');

      const session = {
        sessionId,
        players: players || [],
        ...sessionData
      };

      this.emit('session-joined', { session, playerId: this.currentPlayerId });
      this.emit('player-joined', { 
        playerId: this.currentPlayerId, 
        playerName, 
        session 
      });

    } catch (error) {
      console.error('Error joining session:', error);
      this.emit('error', { message: 'Failed to join session' });
      throw error;
    }
  }

  // Subscribe to realtime updates for a session
  private async subscribeToSession(sessionId: string) {
    await this.unsubscribeFromSession();

    // Subscribe to session players changes
    this.playersChannel = supabase
      .channel(`session_players_${sessionId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'session_players',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          this.handlePlayerUpdate(payload);
        }
      )
      .subscribe();

    // Subscribe to terrain updates
    this.terrainChannel = supabase
      .channel(`terrain_updates_${sessionId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'terrain_updates',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          this.handleTerrainUpdate(payload);
        }
      )
      .subscribe();

    // Subscribe to player cursors
    this.cursorsChannel = supabase
      .channel(`player_cursors_${sessionId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'player_cursors',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          this.handleCursorUpdate(payload);
        }
      )
      .subscribe();
  }

  // Unsubscribe from all channels
  private async unsubscribeFromSession() {
    if (this.playersChannel) {
      await supabase.removeChannel(this.playersChannel);
      this.playersChannel = null;
    }
    if (this.terrainChannel) {
      await supabase.removeChannel(this.terrainChannel);
      this.terrainChannel = null;
    }
    if (this.cursorsChannel) {
      await supabase.removeChannel(this.cursorsChannel);
      this.cursorsChannel = null;
    }
  }

  // Handle player updates
  private handlePlayerUpdate(payload: any) {
    const { eventType, new: newData, old: oldData } = payload;
    
    switch (eventType) {
      case 'INSERT':
        if (newData.player_id !== this.currentPlayerId) {
          this.emit('player-joined', {
            playerId: newData.player_id,
            playerName: newData.player_name,
            playerData: newData
          });
        }
        break;
      case 'DELETE':
        this.emit('player-left', {
          playerId: oldData.player_id,
          playerName: oldData.player_name
        });
        break;
      case 'UPDATE':
        this.emit('player-updated', {
          playerId: newData.player_id,
          playerData: newData
        });
        break;
    }
  }

  // Handle terrain updates
  private handleTerrainUpdate(payload: any) {
    const { new: terrainUpdate } = payload;
    
    if (terrainUpdate.player_id !== this.currentPlayerId) {
      this.emit('terrain-operation', {
        playerId: terrainUpdate.player_id,
        operation: terrainUpdate.operation_type,
        tool: terrainUpdate.tool_type,
        position: terrainUpdate.position,
        area: terrainUpdate.area,
        volumeChange: terrainUpdate.volume_change
      });
    }
  }

  // Handle cursor updates
  private handleCursorUpdate(payload: any) {
    const { eventType, new: newData, old: oldData } = payload;
    
    if (eventType === 'DELETE') {
      this.emit('cursor-update', {
        playerId: oldData.player_id,
        removed: true
      });
    } else if (newData.player_id !== this.currentPlayerId) {
      this.emit('cursor-update', {
        playerId: newData.player_id,
        playerName: newData.player_name,
        position: newData.position,
        tool: newData.tool
      });
    }
  }

  // Send terrain operation
  async sendTerrainOperation(operation: string, tool: string, position: any, area?: any, volumeChange?: number) {
    if (!this.currentSessionId) return;

    try {
      const { error } = await supabase
        .from('terrain_updates')
        .insert({
          session_id: this.currentSessionId,
          player_id: this.currentPlayerId!,
          operation_type: operation,
          tool_type: tool,
          position,
          area,
          volume_change: volumeChange
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending terrain operation:', error);
    }
  }

  // Update cursor position
  async updateCursor(position: any, tool: string) {
    if (!this.currentSessionId || !this.currentPlayerName) return;

    try {
      const { error } = await supabase
        .from('player_cursors')
        .upsert({
          session_id: this.currentSessionId,
          player_id: this.currentPlayerId!,
          player_name: this.currentPlayerName,
          position,
          tool,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating cursor:', error);
    }
  }

  // Leave session
  async leaveSession() {
    if (!this.currentSessionId) return;

    try {
      // Remove player from session
      await supabase
        .from('session_players')
        .delete()
        .eq('session_id', this.currentSessionId)
        .eq('player_id', this.currentPlayerId);

      // Remove cursor
      await supabase
        .from('player_cursors')
        .delete()
        .eq('session_id', this.currentSessionId)
        .eq('player_id', this.currentPlayerId);

      await this.unsubscribeFromSession();
      
      this.currentSessionId = null;
      this.currentPlayerName = null;
      
      this.emit('session-left');
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  }

  // Get session info
  async getSessionInfo(sessionId: string) {
    try {
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      const { data: players } = await supabase
        .from('session_players')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'active');

      return {
        session: sessionData,
        players: players || []
      };
    } catch (error) {
      console.error('Error getting session info:', error);
      return null;
    }
  }

  // Check if connected (always true for Supabase)
  get connected() {
    return true;
  }

  // Get current session ID
  get sessionId() {
    return this.currentSessionId;
  }

  // Get current player ID
  get playerId() {
    return this.currentPlayerId;
  }

  // Disconnect (cleanup)
  async disconnect() {
    await this.leaveSession();
    this.eventHandlers.clear();
  }
} 