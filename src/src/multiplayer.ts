import { io, Socket } from 'socket.io-client';
import { Terrain } from './terrain';

export interface PlayerData {
  id: string;
  name: string;
  joinedAt: number;
}

export interface TerrainModification {
  playerId: string;
  x: number;
  z: number;
  heightChange: number;
  tool: string;
  timestamp: number;
}

export class MultiplayerManager {
  private socket: Socket;
  private terrain: Terrain;
  private currentSession: string | null = null;
  private players: Map<string, PlayerData> = new Map();
  private isConnected = false;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    const serverUrl = import.meta.env.VITE_MULTIPLAYER_SERVER_URL || 'http://localhost:3001';
    
    // Configure Socket.io for production environment
    const socketOptions = serverUrl.includes('vercel.app') ? {
      transports: ['polling'], // Force polling for Vercel
      timeout: 60000,
      forceNew: true
    } : {};
    
    this.socket = io(serverUrl, socketOptions);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.updateConnectionStatus('Connected');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.updateConnectionStatus('Disconnected');
    });

    // Session events
    this.socket.on('session-joined', data => {
      this.currentSession = data.sessionId;
      this.players.clear();

      // Add all existing players
      data.players.forEach((player: PlayerData) => {
        this.players.set(player.id, player);
      });

      // Apply existing terrain modifications
      data.terrainModifications.forEach((mod: TerrainModification) => {
        this.terrain.modifyHeight(mod.x, mod.z, mod.heightChange);
      });

      this.updatePlayerList();
      this.updateSessionStatus(`Session: ${data.sessionId}`);
    });

    this.socket.on('session-full', data => {
      this.updateSessionStatus('Session Full');
    });

    // Player events
    this.socket.on('player-joined', (playerData: PlayerData) => {
      this.players.set(playerData.id, playerData);
      this.updatePlayerList();
    });

    this.socket.on('player-left', data => {
      this.players.delete(data.playerId);
      this.updatePlayerList();
    });

    // Terrain synchronization events
    this.socket.on('terrain-modified', (modification: TerrainModification) => {
      // Apply terrain modification from other players
      if (modification.playerId !== this.socket.id) {
        this.terrain.modifyHeight(
          modification.x,
          modification.z,
          modification.heightChange
        );
      }
    });

    this.socket.on('terrain-reset', () => {
      this.terrain.reset();
    });

    this.socket.on('volume-updated', data => {
      // Could display other players' volume metrics
    });
  }

  public joinSession(sessionId: string, playerName?: string): void {
    if (!this.isConnected) {
      console.error('Not connected to server');
      return;
    }

    this.socket.emit('join-session', {
      sessionId,
      playerName: playerName || `Player ${Date.now()}`,
    });
  }

  public sendTerrainModification(
    x: number,
    z: number,
    heightChange: number,
    tool: string = 'excavator'
  ): void {
    if (!this.currentSession) return;

    this.socket.emit('terrain-modify', {
      x,
      z,
      heightChange,
      tool,
    });
  }

  public sendTerrainReset(): void {
    if (!this.currentSession) return;

    this.socket.emit('terrain-reset');
  }

  public sendVolumeUpdate(volumes: {
    cut: number;
    fill: number;
    net: number;
  }): void {
    if (!this.currentSession) return;

    this.socket.emit('volume-update', { volumes });
  }

  public getCurrentSession(): string | null {
    return this.currentSession;
  }

  public getPlayers(): PlayerData[] {
    return Array.from(this.players.values());
  }

  public isInSession(): boolean {
    return this.currentSession !== null;
  }

  private updateConnectionStatus(status: string): void {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = status;
      statusElement.className = this.isConnected ? 'connected' : 'disconnected';
    }
  }

  private updateSessionStatus(status: string): void {
    const statusElement = document.getElementById('session-status');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }

  private updatePlayerList(): void {
    const playerListElement = document.getElementById('player-list');
    if (playerListElement) {
      const playerNames = Array.from(this.players.values())
        .map(p => p.name)
        .join(', ');
      playerListElement.textContent = playerNames || 'No players';
    }
  }

  public disconnect(): void {
    this.socket.disconnect();
  }
}
