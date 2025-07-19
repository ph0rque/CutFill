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

export interface CompetitiveLobby {
  lobbyId: string;
  lobbyName: string;
  creatorId: string;
  maxPlayers: number;
  currentPlayers: number;
  status: 'waiting' | 'ready' | 'starting' | 'active' | 'completed';
  assignmentConfig?: any;
  createdAt: string;
  players: LobbyPlayer[];
}

export interface LobbyPlayer {
  lobbyId: string;
  playerId: string;
  playerName: string;
  joinedAt: string;
  isReady: boolean;
  score?: number;
  completionTime?: number;
  status: 'active' | 'left';
}

export class SupabaseMultiplayer {
  private terrain: Terrain;
  private currentSessionId: string | null = null;
  private currentPlayerId: string | null = null;
  private currentPlayerName: string | null = null;
  private currentLobbyId: string | null = null;
  private sessionChannel: RealtimeChannel | null = null;
  private playersChannel: RealtimeChannel | null = null;
  private terrainChannel: RealtimeChannel | null = null;
  private cursorsChannel: RealtimeChannel | null = null;
  private lobbyChannel: RealtimeChannel | null = null;
  private lobbyPlayersChannel: RealtimeChannel | null = null;
  
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
    await this.leaveLobby();
    this.eventHandlers.clear();
  }

  // ========== COMPETITIVE LOBBY METHODS ==========

  // Create or join an available competitive lobby
  async joinCompetitiveLobby(playerName: string, ageRange?: string) {
    try {
      this.currentPlayerName = playerName;

      // First, try to find an available lobby
      const { data: availableLobbies } = await supabase
        .from('competitive_lobbies')
        .select(`
          *,
          lobby_players(*)
        `)
        .eq('status', 'waiting')
        .lt('current_players', 4) // Max 4 players
        .order('created_at', { ascending: true })
        .limit(1);

      let lobby;
      let isNewLobby = false;

      if (availableLobbies && availableLobbies.length > 0) {
        // Join existing lobby
        lobby = availableLobbies[0];
        console.log('Joining existing lobby:', lobby.lobby_id);
      } else {
        // Create new lobby
        const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const { data: newLobby, error: createError } = await supabase
          .from('competitive_lobbies')
          .insert({
            lobby_id: lobbyId,
            lobby_name: `Lobby ${lobbyId.slice(-6)}`,
            creator_id: this.currentPlayerId,
            max_players: 4,
            current_players: 0,
            status: 'waiting'
          })
          .select()
          .single();

        if (createError) throw createError;
        lobby = newLobby;
        isNewLobby = true;
        console.log('Created new lobby:', lobbyId);
      }

      // Add player to lobby
      const { error: playerError } = await supabase
        .from('lobby_players')
        .insert({
          lobby_id: lobby.lobby_id,
          player_id: this.currentPlayerId!,
          player_name: playerName,
          status: 'active'
        });

      if (playerError) throw playerError;

      // Update lobby player count
      const { data: currentPlayers } = await supabase
        .from('lobby_players')
        .select('id')
        .eq('lobby_id', lobby.lobby_id)
        .eq('status', 'active');

      await supabase
        .from('competitive_lobbies')
        .update({ current_players: currentPlayers?.length || 1 })
        .eq('lobby_id', lobby.lobby_id);

      this.currentLobbyId = lobby.lobby_id;
      await this.subscribeToLobby(lobby.lobby_id);

      // Get updated lobby data with players
      const lobbyData = await this.getLobbyData(lobby.lobby_id);
      
      this.emit('competitive-lobby-joined', { 
        lobby: lobbyData,
        playerId: this.currentPlayerId,
        isNewLobby 
      });

      return lobbyData;
    } catch (error) {
      console.error('Error joining competitive lobby:', error);
      this.emit('error', { message: 'Failed to join competitive lobby' });
      throw error;
    }
  }

  // Leave current competitive lobby
  async leaveLobby() {
    if (!this.currentLobbyId) return;

    try {
      // Remove player from lobby
      await supabase
        .from('lobby_players')
        .delete()
        .eq('lobby_id', this.currentLobbyId)
        .eq('player_id', this.currentPlayerId);

      // Update lobby player count
      const { data: remainingPlayers } = await supabase
        .from('lobby_players')
        .select('id')
        .eq('lobby_id', this.currentLobbyId)
        .eq('status', 'active');

      const playerCount = remainingPlayers?.length || 0;

      if (playerCount === 0) {
        // Delete empty lobby
        await supabase
          .from('competitive_lobbies')
          .delete()
          .eq('lobby_id', this.currentLobbyId);
      } else {
        // Update player count
        await supabase
          .from('competitive_lobbies')
          .update({ current_players: playerCount })
          .eq('lobby_id', this.currentLobbyId);
      }

      await this.unsubscribeFromLobby();
      
      this.currentLobbyId = null;
      this.emit('competitive-lobby-left');
    } catch (error) {
      console.error('Error leaving lobby:', error);
    }
  }

  // Toggle ready state for current player
  async toggleReady() {
    if (!this.currentLobbyId || !this.currentPlayerId) return;

    try {
      // Get current ready state
      const { data: currentPlayer } = await supabase
        .from('lobby_players')
        .select('*')
        .eq('lobby_id', this.currentLobbyId)
        .eq('player_id', this.currentPlayerId)
        .single();

      if (!currentPlayer) return;

      const newReadyState = !currentPlayer.is_ready;

      // Update ready state
      await supabase
        .from('lobby_players')
        .update({ is_ready: newReadyState })
        .eq('lobby_id', this.currentLobbyId)
        .eq('player_id', this.currentPlayerId);

      // Check if all players are ready
      const { data: allPlayers } = await supabase
        .from('lobby_players')
        .select('*')
        .eq('lobby_id', this.currentLobbyId)
        .eq('status', 'active');

      const readyPlayers = allPlayers?.filter(p => p.is_ready) || [];
      const totalPlayers = allPlayers?.length || 0;

      if (totalPlayers >= 2 && readyPlayers.length === totalPlayers) {
        // All players ready - start match countdown
        await this.startMatchCountdown();
      }

    } catch (error) {
      console.error('Error toggling ready state:', error);
    }
  }

  // Start match countdown when all players are ready
  private async startMatchCountdown() {
    if (!this.currentLobbyId) return;

    try {
      // Update lobby status to starting
      await supabase
        .from('competitive_lobbies')
        .update({ status: 'starting' })
        .eq('lobby_id', this.currentLobbyId);

      this.emit('match-starting', { countdown: 3 });

      // Countdown timer (3 seconds)
      setTimeout(async () => {
        if (this.currentLobbyId) {
          // Update lobby status to active
          await supabase
            .from('competitive_lobbies')
            .update({ 
              status: 'active',
              started_at: new Date().toISOString()
            })
            .eq('lobby_id', this.currentLobbyId);

          this.emit('match-started', { lobbyId: this.currentLobbyId });
        }
      }, 3000);
    } catch (error) {
      console.error('Error starting match countdown:', error);
    }
  }

  // Subscribe to lobby updates
  private async subscribeToLobby(lobbyId: string) {
    await this.unsubscribeFromLobby();

    // Subscribe to lobby changes
    this.lobbyChannel = supabase
      .channel(`competitive_lobby_${lobbyId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'competitive_lobbies',
          filter: `lobby_id=eq.${lobbyId}`
        },
        (payload) => {
          this.handleLobbyUpdate(payload);
        }
      )
      .subscribe();

    // Subscribe to lobby players changes
    this.lobbyPlayersChannel = supabase
      .channel(`lobby_players_${lobbyId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'lobby_players',
          filter: `lobby_id=eq.${lobbyId}`
        },
        (payload) => {
          this.handleLobbyPlayerUpdate(payload);
        }
      )
      .subscribe();
  }

  // Unsubscribe from lobby channels
  private async unsubscribeFromLobby() {
    if (this.lobbyChannel) {
      await supabase.removeChannel(this.lobbyChannel);
      this.lobbyChannel = null;
    }
    if (this.lobbyPlayersChannel) {
      await supabase.removeChannel(this.lobbyPlayersChannel);
      this.lobbyPlayersChannel = null;
    }
  }

  // Handle lobby updates
  private async handleLobbyUpdate(payload: any) {
    const { eventType, new: newData } = payload;
    
    if (eventType === 'UPDATE') {
      const lobbyData = await this.getLobbyData(newData.lobby_id);
      this.emit('lobby-updated', { lobby: lobbyData });

      // Handle specific status changes
      if (newData.status === 'starting') {
        this.emit('match-starting', { countdown: 3 });
      } else if (newData.status === 'active') {
        this.emit('match-started', { lobbyId: newData.lobby_id });
      }
    }
  }

  // Handle lobby player updates
  private async handleLobbyPlayerUpdate(payload: any) {
    const { eventType, new: newData, old: oldData } = payload;
    
    switch (eventType) {
      case 'INSERT':
        if (newData.player_id !== this.currentPlayerId) {
          this.emit('lobby-player-joined', {
            playerId: newData.player_id,
            playerName: newData.player_name
          });
        }
        break;
      case 'DELETE':
        this.emit('lobby-player-left', {
          playerId: oldData.player_id,
          playerName: oldData.player_name
        });
        break;
      case 'UPDATE':
        this.emit('lobby-player-updated', {
          playerId: newData.player_id,
          playerData: newData
        });
        break;
    }

    // Get updated lobby data and emit update
    if (this.currentLobbyId) {
      const lobbyData = await this.getLobbyData(this.currentLobbyId);
      this.emit('lobby-updated', { lobby: lobbyData });
    }
  }

  // Get full lobby data with players
  private async getLobbyData(lobbyId: string): Promise<CompetitiveLobby | null> {
    try {
      const { data: lobbyData } = await supabase
        .from('competitive_lobbies')
        .select(`
          *,
          lobby_players(*)
        `)
        .eq('lobby_id', lobbyId)
        .single();

      if (!lobbyData) return null;

      return {
        lobbyId: lobbyData.lobby_id,
        lobbyName: lobbyData.lobby_name,
        creatorId: lobbyData.creator_id,
        maxPlayers: lobbyData.max_players,
        currentPlayers: lobbyData.current_players,
        status: lobbyData.status,
        assignmentConfig: lobbyData.assignment_config,
        createdAt: lobbyData.created_at,
        players: (lobbyData.lobby_players || []).map((p: any) => ({
          lobbyId: p.lobby_id,
          playerId: p.player_id,
          playerName: p.player_name,
          joinedAt: p.joined_at,
          isReady: p.is_ready || false,
          score: p.score,
          completionTime: p.completion_time,
          status: p.status
        }))
      };
    } catch (error) {
      console.error('Error getting lobby data:', error);
      return null;
    }
  }

  // Get current lobby ID
  get lobbyId() {
    return this.currentLobbyId;
  }

  // Check if in lobby
  get inLobby() {
    return this.currentLobbyId !== null;
  }
} 