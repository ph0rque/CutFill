import { io, Socket } from 'socket.io-client';
import { Terrain } from './terrain';
import { Vector3 } from 'three';

export interface PlayerData {
  id: string;
  name: string;
  role: PlayerRole;
  avatar: string;
  isHost: boolean;
  joinedAt: number;
  lastActiveAt: number;
  cursor: CursorPosition;
  currentTool: string;
  status: PlayerStatus;
  permissions: PlayerPermissions;
  stats: PlayerStats;
}

export interface CursorPosition {
  x: number;
  z: number;
  isVisible: boolean;
  color: string;
  tool: string;
}

export interface PlayerStats {
  volumeMoved: number;
  toolUsages: Record<string, number>;
  sessionTimeMinutes: number;
  contribution: number; // percentage of total work
}

export interface PlayerPermissions {
  canModifyTerrain: boolean;
  canInviteUsers: boolean;
  canKickUsers: boolean;
  canChangeAssignment: boolean;
  canResetTerrain: boolean;
  canManageSession: boolean;
}

export interface GameSession {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, PlayerData>;
  maxPlayers: number;
  isPublic: boolean;
  currentAssignment: string | null;
  currentLevel: number | null;
  liveScores: Map<string, CompetitiveScore>;
  terrainModifications: TerrainModification[];
  sharedObjectives: SharedObjective[];
  sessionState: SessionState;
  settings: SessionSettings;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  spectators: Map<string, SpectatorData>;
}

export interface CompetitiveScore {
  playerId: string;
  totalScore: number;
  objectiveScore: number;
  netZeroScore: number;
  operationsScore: number;
  operationCount: number;
  lastUpdated: number;
}

export interface SharedObjective {
  id: string;
  type: 'collaborative' | 'competitive';
  description: string;
  target: ObjectiveTarget;
  progress: Record<string, number>; // playerId -> progress
  completed: boolean;
  completedBy: string | null;
  completedAt: number | null;
}

export interface ObjectiveTarget {
  type: 'volume_balance' | 'area_level' | 'create_channel' | 'grade_road';
  parameters: any;
  tolerance: number;
}

export interface SpectatorData {
  id: string;
  name: string;
  joinedAt: number;
  canChat: boolean;
}

export interface TerrainModification {
  id: string;
  playerId: string;
  x: number;
  z: number;
  heightChange: number;
  tool: string;
  timestamp: number;
  sessionId: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
  type: 'text' | 'system' | 'achievement' | 'objective';
  metadata?: any;
}

export interface SessionSettings {
  allowSpectators: boolean;
  maxSpectators: number;
  requirePermissionToJoin: boolean;
  enableVoiceChat: boolean;
  enableTextChat: boolean;
  autoSaveInterval: number;
  conflictResolution: 'lastWins' | 'hostPriority' | 'vote';
  pauseOnDisconnect: boolean;
}

export type PlayerRole = 'host' | 'participant' | 'spectator' | 'pending';
export type PlayerStatus = 'active' | 'idle' | 'disconnected' | 'busy';
export type SessionState =
  | 'waiting'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export class EnhancedMultiplayerManager {
  private socket: Socket;
  private terrain: Terrain;
  private currentSession: GameSession | null = null;
  private localPlayer: PlayerData | null = null;
  private players: Map<string, PlayerData> = new Map();
  private spectators: Map<string, SpectatorData> = new Map();
  private chatMessages: ChatMessage[] = [];
  private _isConnectedField = false;
  private cursorUpdateInterval: NodeJS.Timeout | null = null;
  private playerCursors: Map<string, HTMLElement> = new Map();
  private callbacks: MultiplayerCallbacks = {};

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.socket = io('http://localhost:3001');
    this.setupEventHandlers();
    this.startCursorUpdates();
  }

  private setupEventHandlers(): void {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to enhanced multiplayer server');
      this._isConnectedField = true;
      this.callbacks.onConnectionChange?.(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from enhanced multiplayer server');
      this._isConnectedField = false;
      this.callbacks.onConnectionChange?.(false);
      this.cleanupCursors();
    });

    // Session events
    this.socket.on('session-created', (data: { session: GameSession }) => {
      console.log('Session created:', data.session.id);
      this.currentSession = data.session;
      this.callbacks.onSessionCreated?.(data.session);
    });

    this.socket.on(
      'session-joined',
      (data: { session: GameSession; player: PlayerData }) => {
        console.log('Joined session:', data.session.id);
        this.currentSession = data.session;
        this.localPlayer = data.player;
        this.updatePlayerList();
        this.callbacks.onSessionJoined?.(data.session, data.player);
      }
    );

    this.socket.on('session-updated', (data: { session: GameSession }) => {
      console.log('Session updated:', data.session.id);
      this.currentSession = data.session;
      this.updatePlayerList();
      this.callbacks.onSessionUpdated?.(data.session);
    });

    // Player events
    this.socket.on('player-joined', (data: { player: PlayerData }) => {
      console.log('Player joined:', data.player.name);
      this.players.set(data.player.id, data.player);
      this.updatePlayerList();
      this.addChatMessage({
        id: `system-${Date.now()}`,
        playerId: 'system',
        playerName: 'System',
        message: `${data.player.name} joined the session`,
        timestamp: Date.now(),
        type: 'system',
      });
      this.callbacks.onPlayerJoined?.(data.player);
    });

    this.socket.on(
      'player-left',
      (data: { playerId: string; playerName: string }) => {
        console.log('Player left:', data.playerName);
        this.players.delete(data.playerId);
        this.removeCursor(data.playerId);
        this.updatePlayerList();
        this.addChatMessage({
          id: `system-${Date.now()}`,
          playerId: 'system',
          playerName: 'System',
          message: `${data.playerName} left the session`,
          timestamp: Date.now(),
          type: 'system',
        });
        this.callbacks.onPlayerLeft?.(data.playerId);
      }
    );

    this.socket.on('player-updated', (data: { player: PlayerData }) => {
      console.log('Player updated:', data.player.name);
      this.players.set(data.player.id, data.player);
      this.updatePlayerList();
      this.callbacks.onPlayerUpdated?.(data.player);
    });

    // Cursor events
    this.socket.on(
      'cursor-moved',
      (data: { playerId: string; cursor: CursorPosition }) => {
        if (data.playerId !== this.socket.id) {
          this.updatePlayerCursor(data.playerId, data.cursor);
        }
      }
    );

    // Terrain events
    this.socket.on('terrain-modified', (modification: TerrainModification) => {
      if (modification.playerId !== this.socket.id) {
        this.terrain.modifyHeight(
          modification.x,
          modification.z,
          modification.heightChange
        );
        this.callbacks.onTerrainModified?.(modification);
      }
    });

    this.socket.on(
      'terrain-reset',
      (data: { playerId: string; playerName: string }) => {
        console.log('Terrain reset by:', data.playerName);
        // Reset terrain functionality - method not available
        // this.terrain.resetTerrain();
        this.addChatMessage({
          id: `system-${Date.now()}`,
          playerId: 'system',
          playerName: 'System',
          message: `${data.playerName} reset the terrain`,
          timestamp: Date.now(),
          type: 'system',
        });
        this.callbacks.onTerrainReset?.(data.playerId);
      }
    );

    // Chat events
    this.socket.on('chat-message', (message: ChatMessage) => {
      this.addChatMessage(message);
      this.callbacks.onChatMessage?.(message);
    });

    // Objective events
    this.socket.on(
      'objective-updated',
      (data: { objective: SharedObjective }) => {
        console.log('Objective updated:', data.objective.id);
        if (this.currentSession) {
          const index = this.currentSession.sharedObjectives.findIndex(
            obj => obj.id === data.objective.id
          );
          if (index !== -1) {
            this.currentSession.sharedObjectives[index] = data.objective;
          } else {
            this.currentSession.sharedObjectives.push(data.objective);
          }
        }
        this.callbacks.onObjectiveUpdated?.(data.objective);
      }
    );

    this.socket.on(
      'objective-completed',
      (data: { objective: SharedObjective; playerId: string }) => {
        console.log('Objective completed:', data.objective.id);
        const player = this.players.get(data.playerId);
        this.addChatMessage({
          id: `achievement-${Date.now()}`,
          playerId: 'system',
          playerName: 'System',
          message: `${player?.name || 'Player'} completed: ${data.objective.description}`,
          timestamp: Date.now(),
          type: 'achievement',
        });
        this.callbacks.onObjectiveCompleted?.(data.objective, data.playerId);
      }
    );

    // Error events
    this.socket.on('error', (error: { message: string; code: string }) => {
      console.error('Multiplayer error:', error);
      this.callbacks.onError?.(error);
    });

    this.socket.on(
      'permission-denied',
      (data: { action: string; reason: string }) => {
        console.warn('Permission denied:', data.action, data.reason);
        this.callbacks.onPermissionDenied?.(data.action, data.reason);
      }
    );
  }

  // Session management
  public createSession(options: {
    name: string;
    maxPlayers: number;
    isPublic: boolean;
    settings: Partial<SessionSettings>;
  }): void {
    this.socket.emit('create-session', options);
  }

  public joinSession(sessionId: string, playerName: string): void {
    this.socket.emit('join-session', { sessionId, playerName });
  }

  public leaveSession(): void {
    if (this.currentSession) {
      this.socket.emit('leave-session');
      this.currentSession = null;
      this.localPlayer = null;
      this.players.clear();
      this.spectators.clear();
      this.cleanupCursors();
    }
  }

  public updateSessionSettings(settings: Partial<SessionSettings>): void {
    if (this.currentSession && this.localPlayer?.isHost) {
      this.socket.emit('update-session-settings', settings);
    }
  }

  public invitePlayer(playerId: string): void {
    if (this.currentSession && this.localPlayer?.permissions.canInviteUsers) {
      this.socket.emit('invite-player', { playerId });
    }
  }

  public kickPlayer(playerId: string): void {
    if (this.currentSession && this.localPlayer?.permissions.canKickUsers) {
      this.socket.emit('kick-player', { playerId });
    }
  }

  public changePlayerRole(playerId: string, newRole: PlayerRole): void {
    if (this.currentSession && this.localPlayer?.isHost) {
      this.socket.emit('change-player-role', { playerId, newRole });
    }
  }

  // Terrain interaction
  public modifyTerrain(
    x: number,
    z: number,
    heightChange: number,
    tool: string
  ): void {
    if (this.currentSession && this.localPlayer?.permissions.canModifyTerrain) {
      const modification: TerrainModification = {
        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        playerId: this.socket.id || 'unknown',
        x,
        z,
        heightChange,
        tool,
        timestamp: Date.now(),
        sessionId: this.currentSession.id,
      };

      this.socket.emit('terrain-modify', modification);
    }
  }

  public resetTerrain(): void {
    if (this.currentSession && this.localPlayer?.permissions.canResetTerrain) {
      this.socket.emit('terrain-reset');
    }
  }

  // Chat system
  public sendChatMessage(message: string): void {
    if (this.currentSession && this.currentSession.settings.enableTextChat) {
      this.socket.emit('chat-message', { message });
    }
  }

  private addChatMessage(message: ChatMessage): void {
    this.chatMessages.push(message);

    // Keep only last 100 messages
    if (this.chatMessages.length > 100) {
      this.chatMessages = this.chatMessages.slice(-100);
    }

    this.updateChatUI();
  }

  // Cursor management
  private startCursorUpdates(): void {
    this.cursorUpdateInterval = setInterval(() => {
      if (this.currentSession && this.localPlayer) {
        // Get current mouse position over terrain
        const mousePos = this.getMouseTerrainPosition();
        if (mousePos) {
          const cursor: CursorPosition = {
            x: mousePos.x,
            z: mousePos.z,
            isVisible: true,
            color: this.getPlayerColor(this.localPlayer.id),
            tool: this.localPlayer.currentTool,
          };

          this.socket.emit('cursor-move', cursor);
        }
      }
    }, 100); // Update 10 times per second
  }

  private updatePlayerCursor(playerId: string, cursor: CursorPosition): void {
    if (!cursor.isVisible) {
      this.removeCursor(playerId);
      return;
    }

    let cursorElement = this.playerCursors.get(playerId);
    if (!cursorElement) {
      cursorElement = this.createCursorElement(playerId, cursor);
      this.playerCursors.set(playerId, cursorElement);
    }

    // Update cursor position
    const screenPos = this.worldToScreen(cursor.x, cursor.z);
    if (screenPos) {
      cursorElement.style.left = `${screenPos.x}px`;
      cursorElement.style.top = `${screenPos.y}px`;
      cursorElement.style.display = 'block';
    } else {
      cursorElement.style.display = 'none';
    }
  }

  private createCursorElement(
    playerId: string,
    cursor: CursorPosition
  ): HTMLElement {
    const element = document.createElement('div');
    element.className = 'player-cursor';
    element.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid ${cursor.color};
      background: ${cursor.color}40;
      pointer-events: none;
      z-index: 1000;
      transition: all 0.1s ease;
    `;

    const player = this.players.get(playerId);
    if (player) {
      element.title = `${player.name} (${cursor.tool})`;

      // Add player name label
      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        bottom: 25px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
        white-space: nowrap;
      `;
      label.textContent = player.name;
      element.appendChild(label);
    }

    document.body.appendChild(element);
    return element;
  }

  private removeCursor(playerId: string): void {
    const element = this.playerCursors.get(playerId);
    if (element) {
      document.body.removeChild(element);
      this.playerCursors.delete(playerId);
    }
  }

  private cleanupCursors(): void {
    for (const [playerId, element] of this.playerCursors) {
      document.body.removeChild(element);
    }
    this.playerCursors.clear();
  }

  // Utility methods
  private getMouseTerrainPosition(): Vector3 | null {
    // This should be implemented to get the current mouse position over terrain
    // For now, returning null
    return null;
  }

  private worldToScreen(x: number, z: number): { x: number; y: number } | null {
    // This should convert world coordinates to screen coordinates
    // For now, returning null
    return null;
  }

  private getPlayerColor(playerId: string): string {
    const colors = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA07A',
      '#98D8C8',
      '#FFD93D',
    ];
    const index = playerId.charCodeAt(0) % colors.length;
    return colors[index];
  }

  private updatePlayerList(): void {
    // Update UI with current player list
    const playerListElement = document.getElementById('player-list');
    if (playerListElement && this.currentSession) {
      const players = Array.from(this.currentSession.players.values());
      playerListElement.innerHTML = players
        .map(
          player =>
            `<div style="color: ${this.getPlayerColor(player.id)}">
          ${player.isHost ? '👑' : '👤'} ${player.name} (${player.role})
        </div>`
        )
        .join('');
    }
  }

  private updateChatUI(): void {
    const chatElement = document.getElementById('chat-messages');
    if (chatElement) {
      chatElement.innerHTML = this.chatMessages
        .slice(-20)
        .map(msg => {
          const time = new Date(msg.timestamp).toLocaleTimeString([], {
            timeStyle: 'short',
          });
          const color =
            msg.type === 'system' ? '#888' : this.getPlayerColor(msg.playerId);
          return `<div style="color: ${color}; margin: 2px 0;">
          <span style="font-size: 11px;">[${time}]</span>
          <strong>${msg.playerName}:</strong> ${msg.message}
        </div>`;
        })
        .join('');
      chatElement.scrollTop = chatElement.scrollHeight;
    }
  }

  // Getters
  public getCurrentSession(): GameSession | null {
    return this.currentSession;
  }

  public getLocalPlayer(): PlayerData | null {
    return this.localPlayer;
  }

  public getPlayers(): PlayerData[] {
    return Array.from(this.players.values());
  }

  public getSpectators(): SpectatorData[] {
    return Array.from(this.spectators.values());
  }

  public getChatMessages(): ChatMessage[] {
    return this.chatMessages;
  }

  public isConnected(): boolean {
    return this._isConnectedField;
  }

  public setCallbacks(callbacks: MultiplayerCallbacks): void {
    this.callbacks = callbacks;
  }

  // Competitive scoring methods
  public updateLiveScore(playerId: string, assignmentProgress: any): void {
    if (!this.currentSession || !this.currentSession.liveScores) return;

    const competitiveScore: CompetitiveScore = {
      playerId,
      totalScore: assignmentProgress.currentScore,
      objectiveScore: this.calculateObjectiveScore(assignmentProgress),
      netZeroScore: this.calculateNetZeroScore(assignmentProgress),
      operationsScore: assignmentProgress.operationsEfficiencyScore || 0,
      operationCount: assignmentProgress.operationCount || 0,
      lastUpdated: Date.now(),
    };

    this.currentSession.liveScores.set(playerId, competitiveScore);

    // Broadcast score update to all players
    this.socket.emit('live-score-update', {
      sessionId: this.currentSession.id,
      scores: Object.fromEntries(this.currentSession.liveScores),
    });

    console.log(
      `Live score updated for ${playerId}: ${competitiveScore.totalScore.toFixed(1)}`
    );
  }

  public getLeaderboard(): CompetitiveScore[] {
    if (!this.currentSession?.liveScores) return [];

    return Array.from(this.currentSession.liveScores.values()).sort(
      (a, b) => b.totalScore - a.totalScore
    );
  }

  public startCompetitiveLevel(levelId: string): void {
    if (this.currentSession) {
      this.currentSession.currentLevel =
        parseInt(levelId.replace(/\D/g, '')) || 1;
      this.currentSession.liveScores = new Map();

      // Initialize scores for all players
      this.currentSession.players.forEach((player, playerId) => {
        this.currentSession!.liveScores.set(playerId, {
          playerId,
          totalScore: 0,
          objectiveScore: 0,
          netZeroScore: 100, // Start with perfect net-zero
          operationsScore: 100, // Start with perfect efficiency
          operationCount: 0,
          lastUpdated: Date.now(),
        });
      });

      console.log(
        `Started competitive level ${this.currentSession.currentLevel} with ${this.currentSession.players.size} players`
      );
    }
  }

  private calculateObjectiveScore(progress: any): number {
    if (!progress.objectives) return 0;

    let totalScore = 0;
    let totalWeight = 0;

    for (const objective of progress.objectives) {
      totalScore += (objective.score || 0) * (objective.weight || 1);
      totalWeight += objective.weight || 1;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private calculateNetZeroScore(progress: any): number {
    if (!progress.volumeData) return 100;

    const netVolumeYards = Math.abs(progress.volumeData.netMovement || 0);
    return Math.max(0, 100 - netVolumeYards * 10); // Lose 10 points per cubic yard imbalance
  }

  public cleanup(): void {
    if (this.cursorUpdateInterval) {
      clearInterval(this.cursorUpdateInterval);
    }
    this.cleanupCursors();
    this.socket.disconnect();
  }
}

export interface MultiplayerCallbacks {
  onConnectionChange?: (connected: boolean) => void;
  onSessionCreated?: (session: GameSession) => void;
  onSessionJoined?: (session: GameSession, player: PlayerData) => void;
  onSessionUpdated?: (session: GameSession) => void;
  onPlayerJoined?: (player: PlayerData) => void;
  onPlayerLeft?: (playerId: string) => void;
  onPlayerUpdated?: (player: PlayerData) => void;
  onTerrainModified?: (modification: TerrainModification) => void;
  onTerrainReset?: (playerId: string) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onObjectiveUpdated?: (objective: SharedObjective) => void;
  onObjectiveCompleted?: (objective: SharedObjective, playerId: string) => void;
  onError?: (error: { message: string; code: string }) => void;
  onPermissionDenied?: (action: string, reason: string) => void;
}
