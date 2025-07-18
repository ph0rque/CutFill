const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Enable CORS for all routes
app.use(cors());

// Store game sessions and player data
const gameSessions = new Map();
const playerSessions = new Map();

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
      status: 'active'
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

  // Handle disconnection
  socket.on('disconnect', () => {
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

// Score submission endpoint for level completion
app.post('/api/submit-level-attempt', (req, res) => {
  const { userId, levelId, score, operationCount, volumeData, isPractice } = req.body;

  // Server-side score recalculation would go here
  // For now, we'll do basic validation
  
  const validationResult = validateScore(score, score); // Placeholder - would recalculate
  
  if (!validationResult.isValid) {
    return res.status(400).json({
      error: 'Score validation failed',
      details: validationResult
    });
  }

  // Save to database (would integrate with Supabase here)
  console.log(`Level attempt submitted: User ${userId}, Level ${levelId}, Score ${score}, Practice: ${isPractice}`);
  
  res.json({
    success: true,
    serverValidatedScore: validationResult.serverScore,
    saved: true
  });
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
    connectedPlayers: playerSessions.size
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 CutFill multiplayer server running on port ${PORT}`);
  console.log(`📡 Socket.io enabled with CORS for http://localhost:5173`);
}); 