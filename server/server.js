require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, "https://cutfill-frontend-6z7oxm04u.vercel.app", "https://cut-fill.vercel.app", "https://cutfill-frontend-nh454vsi9.vercel.app"]
      : "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Enable CORS and JSON parsing
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL, "https://cutfill-frontend-6z7oxm04u.vercel.app", "https://cut-fill.vercel.app", "https://cutfill-frontend-nh454vsi9.vercel.app"]
    : "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// Store game sessions and player data
const gameSessions = new Map();
const playerSessions = new Map();

// Global active users for username uniqueness (Set of usernames)
const activeUsers = new Set();

// Competitive lobbies management
const competitiveLobbies = new Map();
const lobbyQueue = [];

// Competitive lobby class
class CompetitiveLobby {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.maxPlayers = 4;
    this.minPlayers = 2;
    this.status = 'waiting'; // waiting, ready, starting, active
    this.createdAt = Date.now();
    this.readyPlayers = new Set();
    this.countdownTimer = null;
  }

  addPlayer(playerId, playerData) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    
    playerData.ready = false;
    playerData.joinedAt = Date.now();
    this.players.set(playerId, playerData);
    
    return true;
  }

  removePlayer(playerId) {
    const removed = this.players.delete(playerId);
    this.readyPlayers.delete(playerId);
    
    // Cancel countdown if not enough players
    if (this.players.size < this.minPlayers && this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
      this.status = 'waiting';
    }
    
    return removed;
  }

  togglePlayerReady(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    player.ready = !player.ready;
    
    if (player.ready) {
      this.readyPlayers.add(playerId);
    } else {
      this.readyPlayers.delete(playerId);
      // Cancel countdown if someone becomes unready
      if (this.countdownTimer) {
        clearTimeout(this.countdownTimer);
        this.countdownTimer = null;
        this.status = 'waiting';
      }
    }
    
    // Check if all players are ready
    if (this.players.size >= this.minPlayers && this.readyPlayers.size === this.players.size) {
      this.startCountdown();
    }
    
    return true;
  }

  startCountdown() {
    if (this.countdownTimer) return; // Already counting down
    
    this.status = 'starting';
    let countdown = 3;
    
    // Notify all players that countdown started
    this.broadcastToLobby('match-starting', { countdown });
    
    this.countdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(this.countdownTimer);
        this.startMatch();
      }
    }, 1000);
  }

  startMatch() {
    this.status = 'active';
    
    // Create a competitive game session
    const sessionId = `competitive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = new GameSession(sessionId, {
      name: `Competitive Match - Lobby ${this.id}`,
      maxPlayers: this.maxPlayers,
      isPublic: false,
      isCompetitive: true,
      levelId: 'competitive_1' // Default competitive level
    });
    
    gameSessions.set(sessionId, session);
    
    // Move all lobby players to the game session
    for (const [playerId, playerData] of this.players) {
      session.addPlayer(playerId, {
        ...playerData,
        lobbyId: this.id
      });
      playerSessions.set(playerId, sessionId);
      
      // Make players join the session room
      const socket = io.sockets.sockets.get(playerId);
      if (socket) {
        socket.join(sessionId);
      }
    }
    
    // Notify all players that the match started
    this.broadcastToLobby('match-started', { 
      sessionId,
      lobbyId: this.id,
      session: session.getSessionData()
    });
    
    console.log(`🏆 Competitive match started: Lobby ${this.id} → Session ${sessionId}`);
  }

  broadcastToLobby(event, data) {
    for (const playerId of this.players.keys()) {
      const socket = io.sockets.sockets.get(playerId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  }

  getLobbyData() {
    return {
      lobbyId: this.id,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      minPlayers: this.minPlayers,
      status: this.status,
      players: Array.from(this.players.values()),
      createdAt: this.createdAt
    };
  }

  isEmpty() {
    return this.players.size === 0;
  }
}

// Enhanced game session class
class GameSession {
  constructor(id, options = {}) {
    this.id = id;
    this.name = options.name || `Session ${id}`;
    this.hostId = null;
    this.players = new Map();
    this.spectators = new Map();
    this.maxPlayers = options.maxPlayers || 4;
    this.isPublic = options.isPublic || false;
    this.currentAssignment = null;
    this.currentLevel = options.levelId ? parseInt(options.levelId.replace(/\D/g, '')) : null;
    this.liveScores = new Map();
    this.isCompetitive = options.isCompetitive || false;
    this.currentLevelIdealOperations = options.idealOperations || 30;
    this.terrainModifications = [];
    this.sharedObjectives = [];
    this.sessionState = 'waiting';
    this.settings = {
      allowSpectators: true,
      maxSpectators: 10,
      requirePermissionToJoin: false,
      enableVoiceChat: true,
      enableTextChat: true,
      autoSaveInterval: 30000,
      conflictResolution: 'lastWins',
      pauseOnDisconnect: false,
      ...options.settings
    };
    this.createdAt = Date.now();
    this.startedAt = null;
    this.endedAt = null;
    this.chatMessages = [];
    this.playerCursors = new Map();
  }

  addPlayer(playerId, playerData) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    
    // Set host if this is the first player
    if (this.players.size === 0) {
      this.hostId = playerId;
      playerData.isHost = true;
      playerData.role = 'host';
      playerData.permissions = this.getHostPermissions();
    } else {
      playerData.isHost = false;
      playerData.role = 'participant';
      playerData.permissions = this.getParticipantPermissions();
    }
    
    playerData.cursor = {
      x: 0,
      z: 0,
      isVisible: false,
      color: this.getPlayerColor(playerId),
      tool: 'excavator'
    };
    
    playerData.stats = {
      volumeMoved: 0,
      toolUsages: {},
      sessionTimeMinutes: 0,
      contribution: 0
    };
    
    playerData.ageRange = playerData.ageRange || ''; // Add ageRange property

    this.players.set(playerId, playerData);
    return true;
  }

  removePlayer(playerId) {
    const removedPlayer = this.players.get(playerId);
    this.players.delete(playerId);
    this.playerCursors.delete(playerId);
    
    // Transfer host if needed
    if (playerId === this.hostId && this.players.size > 0) {
      const newHost = this.players.values().next().value;
      newHost.isHost = true;
      newHost.role = 'host';
      newHost.permissions = this.getHostPermissions();
      this.hostId = newHost.id;
    }
    
    return removedPlayer;
  }

  addSpectator(spectatorId, spectatorData) {
    if (this.spectators.size >= this.settings.maxSpectators) {
      return false;
    }
    this.spectators.set(spectatorId, spectatorData);
    return true;
  }

  removeSpectator(spectatorId) {
    this.spectators.delete(spectatorId);
  }

  addTerrainModification(modification) {
    this.terrainModifications.push({
      ...modification,
      timestamp: Date.now()
    });
    
    // Update player stats
    const player = this.players.get(modification.playerId);
    if (player) {
      player.stats.volumeMoved += Math.abs(modification.heightChange);
      player.stats.toolUsages[modification.tool] = (player.stats.toolUsages[modification.tool] || 0) + 1;
    }
  }

  updatePlayerCursor(playerId, cursor) {
    this.playerCursors.set(playerId, cursor);
    const player = this.players.get(playerId);
    if (player) {
      player.cursor = cursor;
    }
  }

  addChatMessage(message) {
    this.chatMessages.push(message);
    if (this.chatMessages.length > 100) {
      this.chatMessages = this.chatMessages.slice(-100);
    }
  }

  updateObjective(objective) {
    const index = this.sharedObjectives.findIndex(obj => obj.id === objective.id);
    if (index !== -1) {
      this.sharedObjectives[index] = objective;
    } else {
      this.sharedObjectives.push(objective);
    }
  }

  getHostPermissions() {
    return {
      canModifyTerrain: true,
      canInviteUsers: true,
      canKickUsers: true,
      canChangeAssignment: true,
      canResetTerrain: true,
      canManageSession: true
    };
  }

  getParticipantPermissions() {
    return {
      canModifyTerrain: true,
      canInviteUsers: false,
      canKickUsers: false,
      canChangeAssignment: false,
      canResetTerrain: false,
      canManageSession: false
    };
  }

  getSpectatorPermissions() {
    return {
      canModifyTerrain: false,
      canInviteUsers: false,
      canKickUsers: false,
      canChangeAssignment: false,
      canResetTerrain: false,
      canManageSession: false
    };
  }

  getPlayerColor(playerId) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#FFD93D'];
    const index = playerId.charCodeAt(0) % colors.length;
    return colors[index];
  }

  getPlayers() {
    return Array.from(this.players.values());
  }

  getSpectators() {
    return Array.from(this.spectators.values());
  }

  getTerrainModifications() {
    return this.terrainModifications;
  }

  getSessionData() {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      players: this.players,
      maxPlayers: this.maxPlayers,
      isPublic: this.isPublic,
      currentAssignment: this.currentAssignment,
      terrainModifications: this.terrainModifications,
      sharedObjectives: this.sharedObjectives,
      sessionState: this.sessionState,
      settings: this.settings,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      spectators: this.spectators
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Handle creating a new session
  socket.on('create-session', (options) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = new GameSession(sessionId, options);
    gameSessions.set(sessionId, session);
    
    socket.emit('session-created', { session: session.getSessionData() });
    console.log(`Session created: ${sessionId}`);
  });

  // Handle joining a game session
  socket.on('join-session', (data) => {
    const { sessionId, playerName } = data;
    
    let session = gameSessions.get(sessionId);
    if (!session) {
      session = new GameSession(sessionId);
      gameSessions.set(sessionId, session);
    }

    const playerData = {
      id: socket.id,
      name: playerName || `Player ${socket.id.substring(0, 4)}`,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
      currentTool: 'excavator',
      status: 'active',
      ageRange: data.ageRange || '',
    };

    if (session.addPlayer(socket.id, playerData)) {
      socket.join(sessionId);
      playerSessions.set(socket.id, sessionId);

      // Send current session state to new player
      socket.emit('session-joined', {
        session: session.getSessionData(),
        player: playerData
      });

      // Notify other players in the session
      socket.to(sessionId).emit('player-joined', { player: playerData });

      console.log(`Player ${socket.id} joined session ${sessionId}`);
    } else {
      socket.emit('session-full', { sessionId });
    }
  });

  // Handle leaving a session
  socket.on('leave-session', () => {
    const sessionId = playerSessions.get(socket.id);
    if (sessionId) {
      const session = gameSessions.get(sessionId);
      if (session) {
        const removedPlayer = session.removePlayer(socket.id);
        socket.leave(sessionId);
        
        // Notify other players
        if (removedPlayer) {
          socket.to(sessionId).emit('player-left', { 
            playerId: socket.id, 
            playerName: removedPlayer.name 
          });
        }

        // Clean up empty sessions
        if (session.players.size === 0) {
          gameSessions.delete(sessionId);
          console.log(`Session ${sessionId} deleted (empty)`);
        }
      }
      
      playerSessions.delete(socket.id);
      console.log(`Player ${socket.id} left session ${sessionId}`);
    }
  });

  // Handle updating session settings
  socket.on('update-session-settings', (settings) => {
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !player.isHost) {
      socket.emit('permission-denied', { action: 'update-settings', reason: 'Only host can update settings' });
      return;
    }

    session.settings = { ...session.settings, ...settings };
    
    // Notify all players
    io.to(sessionId).emit('session-updated', { session: session.getSessionData() });
    console.log(`Session settings updated by ${socket.id} in session ${sessionId}`);
  });

  // Handle player role changes
  socket.on('change-player-role', (data) => {
    const { playerId, newRole } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const requester = session.players.get(socket.id);
    if (!requester || !requester.isHost) {
      socket.emit('permission-denied', { action: 'change-role', reason: 'Only host can change roles' });
      return;
    }

    const targetPlayer = session.players.get(playerId);
    if (!targetPlayer) return;

    targetPlayer.role = newRole;
    if (newRole === 'spectator') {
      targetPlayer.permissions = session.getSpectatorPermissions();
    } else {
      targetPlayer.permissions = session.getParticipantPermissions();
    }

    // Notify all players
    io.to(sessionId).emit('player-updated', { player: targetPlayer });
    console.log(`Player role changed: ${playerId} to ${newRole} in session ${sessionId}`);
  });

  // Handle kicking players
  socket.on('kick-player', (data) => {
    const { playerId } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const requester = session.players.get(socket.id);
    if (!requester || !requester.permissions.canKickUsers) {
      socket.emit('permission-denied', { action: 'kick-player', reason: 'No permission to kick players' });
      return;
    }

    const targetSocket = io.sockets.sockets.get(playerId);
    if (targetSocket) {
      targetSocket.emit('kicked', { reason: 'Kicked by host' });
      targetSocket.leave(sessionId);
    }

    const removedPlayer = session.removePlayer(playerId);
    if (removedPlayer) {
      socket.to(sessionId).emit('player-left', { 
        playerId, 
        playerName: removedPlayer.name 
      });
    }

    playerSessions.delete(playerId);
    console.log(`Player ${playerId} kicked from session ${sessionId}`);
  });

  // Handle cursor movement
  socket.on('cursor-move', (cursor) => {
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    session.updatePlayerCursor(socket.id, cursor);

    // Broadcast cursor position to other players
    socket.to(sessionId).emit('cursor-moved', { playerId: socket.id, cursor });
  });

  // Handle chat messages
  socket.on('chat-message', (data) => {
    const { message } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !session.settings.enableTextChat) return;

    const chatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId: socket.id,
      playerName: player.name,
      message: message.substring(0, 500), // Limit message length
      timestamp: Date.now(),
      type: 'text'
    };

    session.addChatMessage(chatMessage);

    // Broadcast to all players in the session
    io.to(sessionId).emit('chat-message', chatMessage);

    console.log(`Chat message from ${socket.id} in session ${sessionId}: ${message}`);
  });

  // Handle terrain modifications with validation
  socket.on('terrain-modify', (data) => {
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !player.permissions.canModifyTerrain) {
      socket.emit('permission-denied', { action: 'modify-terrain', reason: 'No permission to modify terrain' });
      return;
    }

    // Validate terrain modification
    const validationResult = validateTerrainModification(data, session, player);
    if (!validationResult.isValid) {
      socket.emit('terrain-validation-failed', { 
        reason: validationResult.reason,
        modification: data 
      });
      console.log(`Terrain modification rejected for ${socket.id}: ${validationResult.reason}`);
      return;
    }

    const modification = {
      ...data,
      playerId: socket.id,
      timestamp: Date.now(),
      sessionId: sessionId,
      serverValidated: true
    };

    session.addTerrainModification(modification);

    // Update player operation count for competitive scoring
    if (session.isCompetitive) {
      updatePlayerOperationCount(session, socket.id);
    }

    // Broadcast to all players in the session
    io.to(sessionId).emit('terrain-modified', modification);

    console.log(`Terrain modified by ${socket.id} in session ${sessionId} - validated`);
  });

  // Handle terrain reset
  socket.on('terrain-reset', () => {
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !player.permissions.canResetTerrain) {
      socket.emit('permission-denied', { action: 'reset-terrain', reason: 'No permission to reset terrain' });
      return;
    }

    // Clear all terrain modifications
    session.terrainModifications = [];

    // Broadcast reset to all players
    io.to(sessionId).emit('terrain-reset', { playerId: socket.id, playerName: player.name });

    console.log(`Terrain reset by ${socket.id} in session ${sessionId}`);
  });

  // Handle objective updates
  socket.on('objective-update', (data) => {
    const { objective } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !player.permissions.canChangeAssignment) {
      socket.emit('permission-denied', { action: 'update-objective', reason: 'No permission to update objectives' });
      return;
    }

    session.updateObjective(objective);

    // Broadcast to all players
    io.to(sessionId).emit('objective-updated', { objective });

    console.log(`Objective updated by ${socket.id} in session ${sessionId}`);
  });

  // Handle objective completion
  socket.on('objective-complete', (data) => {
    const { objectiveId } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const objective = session.sharedObjectives.find(obj => obj.id === objectiveId);
    if (!objective) return;

    objective.completed = true;
    objective.completedBy = socket.id;
    objective.completedAt = Date.now();

    // Broadcast completion to all players
    io.to(sessionId).emit('objective-completed', { objective, playerId: socket.id });

    console.log(`Objective ${objectiveId} completed by ${socket.id} in session ${sessionId}`);
  });

  // Handle assignment changes
  socket.on('change-assignment', (data) => {
    const { assignmentId } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !player.permissions.canChangeAssignment) {
      socket.emit('permission-denied', { action: 'change-assignment', reason: 'No permission to change assignments' });
      return;
    }

    session.currentAssignment = assignmentId;
    session.sessionState = 'active';
    session.startedAt = Date.now();

    // Broadcast to all players
    io.to(sessionId).emit('session-updated', { session: session.getSessionData() });

    console.log(`Assignment changed to ${assignmentId} by ${socket.id} in session ${sessionId}`);
  });

  // Handle session state changes
  socket.on('change-session-state', (data) => {
    const { newState } = data;
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    const session = gameSessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(socket.id);
    if (!player || !player.permissions.canManageSession) {
      socket.emit('permission-denied', { action: 'change-session-state', reason: 'No permission to manage session' });
      return;
    }

    session.sessionState = newState;
    
    if (newState === 'completed') {
      session.endedAt = Date.now();
    }

    // Broadcast to all players
    io.to(sessionId).emit('session-updated', { session: session.getSessionData() });

    console.log(`Session state changed to ${newState} by ${socket.id} in session ${sessionId}`);
  });

  // Handle volume updates
  socket.on('volume-update', (data) => {
    const sessionId = playerSessions.get(socket.id);
    if (!sessionId) return;

    // Broadcast volume update to other players
    socket.to(sessionId).emit('volume-updated', {
      playerId: socket.id,
      volumes: data.volumes
    });
  });

  // Handle guest registration
  socket.on('register-guest', (data) => {
    const { desiredUsername, ageRange, mode } = data;
    let username = desiredUsername.trim();
    if (activeUsers.has(username)) {
      // Suggest alternative
      let n = 2;
      let suggested = `${username}${n}`;
      while (activeUsers.has(suggested)) {
        n++;
        suggested = `${username}${n}`;
      }
      socket.emit('username-taken', { suggestedUsername: suggested });
      console.log(`Username ${username} taken, suggested ${suggested}`);
    } else {
      // Register
      activeUsers.add(username);
      const tempGuestId = `guest_${Math.random().toString(36).substr(2, 9)}`;
      socket.emit('guest-registered', { username, tempGuestId, ageRange, mode });
      console.log(`Guest registered: ${username} with ID ${tempGuestId}`);
    }
  });

  // Handle competitive lobby events
  socket.on('join-competitive-lobby', (data) => {
    const { username, ageRange, tempGuestId } = data;
    
    console.log(`🏆 Player ${username} joining competitive lobby...`);
    
    // Find available lobby or create new one
    let availableLobby = null;
    for (const lobby of competitiveLobbies.values()) {
      if (lobby.status === 'waiting' && lobby.players.size < lobby.maxPlayers) {
        availableLobby = lobby;
        break;
      }
    }
    
    if (!availableLobby) {
      // Create new lobby
      const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      availableLobby = new CompetitiveLobby(lobbyId);
      competitiveLobbies.set(lobbyId, availableLobby);
      console.log(`🆕 Created new competitive lobby: ${lobbyId}`);
    }
    
    // Add player to lobby
    const playerData = {
      id: socket.id,
      username,
      ageRange,
      tempGuestId,
      ready: false
    };
    
    if (availableLobby.addPlayer(socket.id, playerData)) {
      // Join lobby room
      socket.join(`lobby_${availableLobby.id}`);
      
      // Notify player they joined
      socket.emit('competitive-lobby-joined', availableLobby.getLobbyData());
      
      // Notify other players in lobby
      socket.to(`lobby_${availableLobby.id}`).emit('lobby-updated', availableLobby.getLobbyData());
      
      console.log(`✅ Player ${username} joined lobby ${availableLobby.id} (${availableLobby.players.size}/${availableLobby.maxPlayers})`);
    } else {
      socket.emit('lobby-error', { message: 'Failed to join lobby - lobby full' });
    }
  });

  socket.on('leave-competitive-lobby', (data) => {
    const { lobbyId } = data;
    const lobby = competitiveLobbies.get(lobbyId);
    
    if (lobby && lobby.removePlayer(socket.id)) {
      socket.leave(`lobby_${lobbyId}`);
      
      // Notify remaining players
      socket.to(`lobby_${lobbyId}`).emit('lobby-updated', lobby.getLobbyData());
      
      // Clean up empty lobby
      if (lobby.isEmpty()) {
        competitiveLobbies.delete(lobbyId);
        console.log(`🗑️ Deleted empty lobby: ${lobbyId}`);
      }
      
      console.log(`➖ Player ${socket.id} left lobby ${lobbyId}`);
    }
  });

  socket.on('toggle-ready', (data) => {
    const { lobbyId } = data;
    const lobby = competitiveLobbies.get(lobbyId);
    
    if (lobby && lobby.togglePlayerReady(socket.id)) {
      // Broadcast updated lobby state
      io.to(`lobby_${lobbyId}`).emit('lobby-updated', lobby.getLobbyData());
      
      const player = lobby.players.get(socket.id);
      console.log(`🎯 Player ${player?.username || socket.id} is ${player?.ready ? 'ready' : 'not ready'} in lobby ${lobbyId}`);
    }
  });

  // Handle disconnection (remove from activeUsers if guest)
  socket.on('disconnect', () => {
    // Handle competitive lobby disconnection
    for (const [lobbyId, lobby] of competitiveLobbies) {
      if (lobby.players.has(socket.id)) {
        lobby.removePlayer(socket.id);
        socket.to(`lobby_${lobbyId}`).emit('lobby-updated', lobby.getLobbyData());
        
        // Clean up empty lobby
        if (lobby.isEmpty()) {
          competitiveLobbies.delete(lobbyId);
          console.log(`🗑️ Deleted empty lobby after disconnect: ${lobbyId}`);
        }
        break;
      }
    }
    
    const sessionId = playerSessions.get(socket.id);
    if (sessionId) {
      const session = gameSessions.get(sessionId);
      if (session) {
        const removedPlayer = session.removePlayer(socket.id);
        
        // Notify other players
        if (removedPlayer) {
          socket.to(sessionId).emit('player-left', { 
            playerId: socket.id, 
            playerName: removedPlayer.name 
          });
        }

        // Check if session should be paused
        if (session.settings.pauseOnDisconnect && session.sessionState === 'active') {
          session.sessionState = 'paused';
          io.to(sessionId).emit('session-updated', { session: session.getSessionData() });
        }

        // Clean up empty sessions
        if (session.players.size === 0 && session.spectators.size === 0) {
          gameSessions.delete(sessionId);
          console.log(`Session ${sessionId} deleted (empty)`);
        }

        // Clean up guest username (moved inside session block)
        if (removedPlayer && removedPlayer.name) {
          activeUsers.delete(removedPlayer.name);
          console.log(`Removed guest username: ${removedPlayer.name}`);
        }
      }
      
      playerSessions.delete(socket.id);
    }

    console.log(`Player disconnected: ${socket.id}`);
  });
});

// Server-side validation functions
function validateTerrainModification(data, session, player) {
  // Basic data validation
  if (!data || typeof data.x !== 'number' || typeof data.z !== 'number' || typeof data.heightChange !== 'number') {
    return { isValid: false, reason: 'Invalid modification data' };
  }

  // Bounds checking (assuming 100x100 terrain)
  if (data.x < 0 || data.x > 100 || data.z < 0 || data.z > 100) {
    return { isValid: false, reason: 'Modification outside terrain bounds' };
  }

  // Height change limits (prevent extreme modifications)
  const maxHeightChange = 20; // 20 feet max change per operation
  if (Math.abs(data.heightChange) > maxHeightChange) {
    return { isValid: false, reason: 'Height change exceeds maximum limit' };
  }

  // Rate limiting - prevent rapid-fire modifications
  const now = Date.now();
  const lastModification = player.lastModificationTime || 0;
  const minInterval = 50; // 50ms minimum between modifications
  
  if (now - lastModification < minInterval) {
    return { isValid: false, reason: 'Modification rate too high' };
  }

  // Update last modification time
  player.lastModificationTime = now;

  return { isValid: true };
}

function updatePlayerOperationCount(session, playerId) {
  if (!session.liveScores) {
    session.liveScores = new Map();
  }

  const currentScore = session.liveScores.get(playerId) || {
    playerId,
    totalScore: 0,
    objectiveScore: 0,
    netZeroScore: 100,
    operationsScore: 100,
    operationCount: 0,
    lastUpdated: Date.now()
  };

  currentScore.operationCount++;
  currentScore.lastUpdated = Date.now();

  // Recalculate operations efficiency (this would need ideal operations from level config)
  const idealOperations = session.currentLevelIdealOperations || 30; // Default fallback
  currentScore.operationsScore = Math.min(100, (idealOperations / currentScore.operationCount) * 100);

  session.liveScores.set(playerId, currentScore);

  // Broadcast updated score to all players in session
  io.to(session.id).emit('live-score-update', {
    sessionId: session.id,
    playerId,
    score: currentScore
  });
}

function validateScore(submittedScore, serverCalculatedScore, tolerance = 5) {
  // Allow small tolerance for floating point differences
  const difference = Math.abs(submittedScore - serverCalculatedScore);
  const percentDifference = (difference / serverCalculatedScore) * 100;
  
  return {
    isValid: percentDifference <= tolerance,
    difference: percentDifference,
    serverScore: serverCalculatedScore,
    submittedScore
  };
}

// Enhanced server-side scoring calculation for new progression system
function calculateServerScore(volumeData, operationCount, idealOperations, objectivesPassed = false, ageBracket = 'teens') {
  const cutVolume = Math.abs(volumeData.cut || 0);
  const fillVolume = Math.abs(volumeData.fill || 0);
  const netVolume = Math.abs(cutVolume - fillVolume);
  
  // If objectives not passed, score is 0
  if (!objectivesPassed) {
    return {
      finalScore: 0,
      objectiveScore: 0, // Not used in new system but kept for compatibility
      netZeroScore: 0,
      operationsScore: 0,
      passed: false,
      breakdown: {
        cutVolume,
        fillVolume,
        netVolume,
        operationCount,
        idealOperations
      }
    };
  }
  
  // Age-adjusted tolerance factors
  const toleranceFactors = {
    'kids': 3.0,     // Very forgiving
    'teens': 1.5,    // Moderate
    'adults': 1.0    // Professional standard
  };
  const toleranceFactor = toleranceFactors[ageBracket] || 1.5;
  
  // Net-zero score (50% weight) - adjusted for age bracket
  const netZeroScore = Math.max(0, 100 - (netVolume * (10 / toleranceFactor)));
  
  // Operations efficiency score (50% weight)
  const operationsScore = operationCount > 0 ? Math.min(100, (idealOperations / operationCount) * 100) : 0;
  
  // New scoring: 50% Net-Zero Closeness + 50% Operations Efficiency
  const finalScore = Math.round((netZeroScore * 0.5) + (operationsScore * 0.5));
  
  return {
    finalScore,
    objectiveScore: 100, // Passed objectives = 100, kept for compatibility
    netZeroScore: Math.round(netZeroScore),
    operationsScore: Math.round(operationsScore),
    passed: true,
    breakdown: {
      cutVolume,
      fillVolume,
      netVolume,
      operationCount,
      idealOperations,
      ageBracket,
      toleranceFactor
    }
  };
}

// Server-side level attempt submission with database integration
app.post('/api/submit-level-attempt', async (req, res) => {
  try {
    const { 
      userId, 
      levelId, 
      levelVersion = 1,
      clientScore, 
      operationCount, 
      idealOperations,
      volumeData, 
      durationSeconds,
      isPractice = true,
      objectivesPassed = false,
      ageBracket = 'teens'
    } = req.body;

    // Validate required fields
    if (!userId || !levelId || !volumeData || operationCount === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'levelId', 'volumeData', 'operationCount']
      });
    }

    // Server-side score calculation for validation with new progression system
    const serverScoring = calculateServerScore(volumeData, operationCount, idealOperations || 30, objectivesPassed, ageBracket);
    
    // Validate client score against server calculation (allow 5% tolerance)
    const scoreValidation = validateScore(clientScore, serverScoring.finalScore, 5);
    
    if (!scoreValidation.isValid) {
      console.warn(`Score validation failed for user ${userId}, level ${levelId}:`, scoreValidation);
      // Use server score instead of rejecting (for better UX)
    }

    // Use server-calculated score for database storage
    const validatedScore = serverScoring.finalScore;

    // Save to Supabase database with new progression fields
    const { data, error } = await supabase
      .from('level_attempts')
      .insert({
        user_id: userId,
        level_id: levelId,
        level_version: levelVersion,
        score: validatedScore,
        objective_points: serverScoring.objectiveScore,
        net_zero_points: serverScoring.netZeroScore,
        operations_points: serverScoring.operationsScore,
        operations_count: operationCount,
        ideal_operations: idealOperations || 30,
        net_volume: serverScoring.breakdown.netVolume,
        duration_seconds: durationSeconds,
        is_practice: isPractice,
        server_validated: true,
        passed: serverScoring.passed,
        age_bracket: ageBracket
      })
      .select()
      .single();

    if (error) {
      console.error('Database error saving level attempt:', error);
      return res.status(500).json({
        error: 'Failed to save level attempt',
        details: error.message
      });
    }

    console.log(`✅ Level attempt saved: User ${userId}, Level ${levelId}, Score ${validatedScore}, Practice: ${isPractice}`);
    
    res.json({
      success: true,
      attemptId: data.id,
      serverValidatedScore: validatedScore,
      scoring: serverScoring,
      scoreValidation: scoreValidation,
      saved: true
    });

  } catch (error) {
    console.error('Error in submit-level-attempt:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Unlock next level endpoint
app.post('/api/unlock-next-level', async (req, res) => {
  try {
    const { userId, completedLevel } = req.body;

    if (!userId || !completedLevel) {
      return res.status(400).json({
        error: 'Missing required fields: userId, completedLevel'
      });
    }

    // Get current unlocked levels
    const { data: userData, error: fetchError } = await supabase
      .from('user_progress')
      .select('unlocked_levels')
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching user progress:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch user progress' });
    }

    const currentUnlocked = userData?.unlocked_levels || [1];
    const nextLevel = completedLevel + 1;

    // Check if next level should be unlocked
    if (!currentUnlocked.includes(nextLevel) && currentUnlocked.includes(completedLevel)) {
      const updatedLevels = [...currentUnlocked, nextLevel].sort((a, b) => a - b);

      const { error: updateError } = await supabase
        .from('user_progress')
        .update({ unlocked_levels: updatedLevels })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating unlocked levels:', updateError);
        return res.status(500).json({ error: 'Failed to unlock next level' });
      }

      res.json({
        success: true,
        unlockedLevel: nextLevel,
        allUnlockedLevels: updatedLevels
      });
    } else {
      res.json({
        success: true,
        message: 'Level already unlocked or requirements not met',
        allUnlockedLevels: currentUnlocked
      });
    }

  } catch (error) {
    console.error('Error in unlock-next-level:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ==================== TERRAIN API ENDPOINTS ====================

// Get terrain configuration for a specific level
app.get('/api/terrain/:levelId', async (req, res) => {
  try {
    const { levelId } = req.params;
    const { assignmentId } = req.query;

    if (!levelId) {
      return res.status(400).json({
        error: 'Missing required parameter: levelId'
      });
    }

    let query = supabase
      .from('level_terrains')
      .select(`
        id,
        level_id,
        assignment_id,
        name,
        description,
        terrain_data,
        terrain_config,
        is_default,
        created_at
      `)
      .eq('level_id', parseInt(levelId));

    // Helper function to validate UUID format
    const isValidUUID = (str) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // If assignment ID provided, filter by it, otherwise get default
    if (assignmentId) {
      // First try to find by assignment name
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('id')
        .eq('name', assignmentId)
        .single();
      
      if (assignmentData && !assignmentError) {
        // Found assignment by name, use its UUID
        query = query.eq('assignment_id', assignmentData.id);
      } else if (isValidUUID(assignmentId)) {
        // It's a valid UUID format, try using it directly
        query = query.eq('assignment_id', assignmentId);
      } else {
        // Invalid assignment name/UUID, fall back to default terrain
        console.log(`⚠️  Invalid assignment ID "${assignmentId}", falling back to default terrain`);
        query = query.eq('is_default', true);
      }
    } else {
      query = query.eq('is_default', true);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('Error fetching terrain configuration:', error);
      return res.status(404).json({
        error: 'Terrain configuration not found',
        details: error.message
      });
    }

    console.log(`✅ Terrain configuration loaded: Level ${levelId}, Assignment ${data.assignment_id}`);
    
    res.json({
      success: true,
      terrain: data
    });

  } catch (error) {
    console.error('Error in get terrain:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Save terrain configuration for a level
app.post('/api/terrain/save', async (req, res) => {
  try {
    const { 
      levelId, 
      assignmentId, 
      name, 
      description, 
      terrainData, 
      terrainConfig, 
      isDefault = false,
      userId 
    } = req.body;

    if (!levelId || !terrainData || !userId) {
      return res.status(400).json({
        error: 'Missing required fields: levelId, terrainData, userId'
      });
    }

    // If setting as default, remove default flag from other terrains for this level
    if (isDefault) {
      await supabase
        .from('level_terrains')
        .update({ is_default: false })
        .eq('level_id', levelId);
    }

    const { data, error } = await supabase
      .from('level_terrains')
      .insert({
        level_id: levelId,
        assignment_id: assignmentId,
        name: name || `Level ${levelId} Terrain - ${new Date().toLocaleDateString()}`,
        description: description || `Custom terrain configuration for level ${levelId}`,
        terrain_data: terrainData,
        terrain_config: terrainConfig || {},
        is_default: isDefault,
        created_by: userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving terrain configuration:', error);
      return res.status(500).json({
        error: 'Failed to save terrain configuration',
        details: error.message
      });
    }

    console.log(`✅ Terrain configuration saved: Level ${levelId}, ID ${data.id}, Default: ${isDefault}`);
    
    res.json({
      success: true,
      terrain: data
    });

  } catch (error) {
    console.error('Error in save terrain:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Update existing terrain configuration
app.put('/api/terrain/:terrainId', async (req, res) => {
  try {
    const { terrainId } = req.params;
    const { 
      name, 
      description, 
      terrainData, 
      terrainConfig, 
      isDefault,
      userId 
    } = req.body;

    if (!terrainId || !userId) {
      return res.status(400).json({
        error: 'Missing required fields: terrainId, userId'
      });
    }

    // Verify ownership or admin permission
    const { data: existingTerrain, error: fetchError } = await supabase
      .from('level_terrains')
      .select('created_by, level_id')
      .eq('id', terrainId)
      .single();

    if (fetchError || !existingTerrain) {
      return res.status(404).json({
        error: 'Terrain configuration not found'
      });
    }

    if (existingTerrain.created_by !== userId) {
      return res.status(403).json({
        error: 'Permission denied: You can only modify your own terrain configurations'
      });
    }

    // If setting as default, remove default flag from other terrains for this level
    if (isDefault) {
      await supabase
        .from('level_terrains')
        .update({ is_default: false })
        .eq('level_id', existingTerrain.level_id);
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (terrainData !== undefined) updateData.terrain_data = terrainData;
    if (terrainConfig !== undefined) updateData.terrain_config = terrainConfig;
    if (isDefault !== undefined) updateData.is_default = isDefault;

    const { data, error } = await supabase
      .from('level_terrains')
      .update(updateData)
      .eq('id', terrainId)
      .select()
      .single();

    if (error) {
      console.error('Error updating terrain configuration:', error);
      return res.status(500).json({
        error: 'Failed to update terrain configuration',
        details: error.message
      });
    }

    console.log(`✅ Terrain configuration updated: ID ${terrainId}, Default: ${data.is_default}`);
    
    res.json({
      success: true,
      terrain: data
    });

  } catch (error) {
    console.error('Error in update terrain:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// List all terrain configurations for a level
app.get('/api/terrain/list/:levelId', async (req, res) => {
  try {
    const { levelId } = req.params;

    if (!levelId) {
      return res.status(400).json({
        error: 'Missing required parameter: levelId'
      });
    }

    const { data, error } = await supabase
      .from('level_terrains')
      .select(`
        id,
        level_id,
        assignment_id,
        name,
        description,
        terrain_config,
        is_default,
        created_at,
        created_by
      `)
      .eq('level_id', parseInt(levelId))
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching terrain list:', error);
      return res.status(500).json({
        error: 'Failed to fetch terrain configurations',
        details: error.message
      });
    }

    console.log(`✅ Terrain list loaded: Level ${levelId}, Count: ${data.length}`);
    
    res.json({
      success: true,
      terrains: data
    });

  } catch (error) {
    console.error('Error in list terrains:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Delete terrain configuration
app.delete('/api/terrain/:terrainId', async (req, res) => {
  try {
    const { terrainId } = req.params;
    const { userId } = req.body;

    if (!terrainId || !userId) {
      return res.status(400).json({
        error: 'Missing required fields: terrainId, userId'
      });
    }

    // Verify ownership
    const { data: existingTerrain, error: fetchError } = await supabase
      .from('level_terrains')
      .select('created_by, is_default, name')
      .eq('id', terrainId)
      .single();

    if (fetchError || !existingTerrain) {
      return res.status(404).json({
        error: 'Terrain configuration not found'
      });
    }

    if (existingTerrain.created_by !== userId) {
      return res.status(403).json({
        error: 'Permission denied: You can only delete your own terrain configurations'
      });
    }

    if (existingTerrain.is_default) {
      return res.status(400).json({
        error: 'Cannot delete default terrain configuration'
      });
    }

    const { error } = await supabase
      .from('level_terrains')
      .delete()
      .eq('id', terrainId);

    if (error) {
      console.error('Error deleting terrain configuration:', error);
      return res.status(500).json({
        error: 'Failed to delete terrain configuration',
        details: error.message
      });
    }

    console.log(`✅ Terrain configuration deleted: ID ${terrainId}, Name: ${existingTerrain.name}`);
    
    res.json({
      success: true,
      message: 'Terrain configuration deleted successfully'
    });

  } catch (error) {
    console.error('Error in delete terrain:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get user's unlocked levels
app.get('/api/unlocked-levels/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('user_progress')
      .select('unlocked_levels')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching unlocked levels:', error);
      return res.status(500).json({ error: 'Failed to fetch unlocked levels' });
    }

    const unlockedLevels = data?.unlocked_levels || [1];

    res.json({
      success: true,
      unlockedLevels
    });

  } catch (error) {
    console.error('Error in get unlocked levels:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get leaderboard for a specific level
app.get('/api/leaderboard/:levelId', async (req, res) => {
  try {
    const { levelId } = req.params;
    const { mode = 'competitive', limit = 10 } = req.query;

    const isPractice = mode === 'practice';

    const { data, error } = await supabase
      .from('level_attempts')
      .select(`
        id,
        score,
        operations_count,
        duration_seconds,
        completed_at,
        user_id,
        users!inner(display_name, username)
      `)
      .eq('level_id', levelId)
      .eq('is_practice', isPractice)
      .eq('server_validated', true)
      .order('score', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    const leaderboard = data.map((attempt, index) => ({
      rank: index + 1,
      userId: attempt.user_id,
      displayName: attempt.users.display_name || attempt.users.username || 'Anonymous',
      score: attempt.score,
      operationsCount: attempt.operations_count,
      duration: attempt.duration_seconds,
      completedAt: attempt.completed_at
    }));

    res.json({
      success: true,
      levelId,
      mode,
      leaderboard
    });

  } catch (error) {
    console.error('Error in get leaderboard:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Terrain modification validation endpoint
app.post('/api/validate-terrain-modification', (req, res) => {
  try {
    const { sessionId, modification, playerId } = req.body;

    const session = gameSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const player = session.players.get(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found in session' });
    }

    const validation = validateTerrainModification(modification, session, player);
    
    if (validation.isValid) {
      // Update operation count and live scores
      updatePlayerOperationCount(session, playerId);
      
      // Store modification in session history
      session.terrainModifications.push({
        playerId,
        modification,
        timestamp: Date.now(),
        validated: true
      });
    }

    res.json({
      isValid: validation.isValid,
      reason: validation.reason,
      operationCount: session.liveScores.get(playerId)?.operationCount || 0
    });

  } catch (error) {
    console.error('Error validating terrain modification:', error);
    res.status(500).json({
      error: 'Validation failed',
      message: error.message
    });
  }
});

// API endpoints
app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(gameSessions.values()).map(session => ({
    id: session.id,
    playerCount: session.players.size,
    maxPlayers: session.maxPlayers,
    createdAt: session.createdAt
  }));
  
  res.json(sessions);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    activeSessions: gameSessions.size,
    connectedPlayers: playerSessions.size,
    competitiveLobbies: competitiveLobbies.size,
    lobbyDetails: Array.from(competitiveLobbies.values()).map(lobby => ({
      id: lobby.id,
      playerCount: lobby.players.size,
      status: lobby.status,
      createdAt: lobby.createdAt
    }))
  });
});

// Get competitive lobbies info (for debugging)
app.get('/api/lobbies', (req, res) => {
  const lobbies = Array.from(competitiveLobbies.values()).map(lobby => ({
    ...lobby.getLobbyData(),
    players: Array.from(lobby.players.values()).map(player => ({
      id: player.id,
      username: player.username,
      ageRange: player.ageRange,
      ready: player.ready,
      joinedAt: player.joinedAt
    }))
  }));
  
  res.json({
    totalLobbies: competitiveLobbies.size,
    lobbies
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 CutFill multiplayer server running on port ${PORT}`);
  console.log(`📡 Socket.io enabled with CORS for http://localhost:5173`);
}); 