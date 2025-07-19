import { EnhancedMultiplayerManager } from './multiplayer-enhanced';
import type {
  GameSession,
  PlayerData,
  ChatMessage,
} from './multiplayer-enhanced';

export class MultiplayerUI {
  private multiplayerManager: EnhancedMultiplayerManager;
  private uiContainer: HTMLElement;
  private isInitialized = false;

  constructor(multiplayerManager: EnhancedMultiplayerManager) {
    this.multiplayerManager = multiplayerManager;
    this.uiContainer = document.createElement('div');
    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.multiplayerManager.setCallbacks({
      onSessionJoined: (session, player) =>
        this.onSessionJoined(session, player),
      onSessionUpdated: session => this.onSessionUpdated(session),
      onPlayerJoined: player => this.onPlayerJoined(player),
      onPlayerLeft: playerId => this.onPlayerLeft(playerId),
      onPlayerUpdated: player => this.onPlayerUpdated(player),
      onChatMessage: message => this.onChatMessage(message),
      onPermissionDenied: (action, reason) =>
        this.onPermissionDenied(action, reason),
      onError: error => this.onError(error),
    });
  }

  public initializeUI(): void {
    if (this.isInitialized) return;

    this.createMultiplayerPanel();
    this.createSessionControls();
    this.createChatSystem();
    this.createPlayerManagement();
    this.createSessionLobby();

    this.isInitialized = true;
  }

  private createMultiplayerPanel(): void {
    this.uiContainer.id = 'multiplayer-panel';
    this.uiContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      background: rgba(42, 42, 42, 0.95);
      border-radius: 8px;
      padding: 15px;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      backdrop-filter: blur(5px);
      display: none;
    `;

    document.body.appendChild(this.uiContainer);
  }

  private createSessionControls(): void {
    const controlsSection = document.createElement('div');
    controlsSection.id = 'session-controls';
    controlsSection.innerHTML = `
      <div style="margin-bottom: 15px; border-bottom: 1px solid #555; padding-bottom: 10px;">
        <h3 style="margin: 0 0 10px 0;">Session Controls</h3>
        
        <!-- Level Selection -->
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #ccc;">Select Level:</label>
          <select id="level-select" style="width: 100%; padding: 5px; background: rgba(255,255,255,0.1); color: white; border: 1px solid #555; border-radius: 4px;">
            <option value="">Select a level...</option>
          </select>
        </div>

        <!-- Session Actions -->
        <div style="display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap;">
          <button id="quick-match-btn" style="padding: 5px 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;">🚀 Quick Match</button>
          <button id="create-competitive-btn" style="padding: 5px 10px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer;">🏆 Create Competitive</button>
          <button id="create-session-btn" style="padding: 5px 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Create Practice</button>
        </div>
        
        <div style="display: flex; gap: 5px; margin-bottom: 10px;">
          <button id="join-session-btn" style="padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Join Session</button>
          <button id="spectate-btn" style="padding: 5px 10px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer;">👁️ Spectate</button>
          <button id="leave-session-btn" style="padding: 5px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; display: none;">Leave Session</button>
        </div>

        <div id="session-info" style="font-size: 12px; color: #ccc;">
          Not in session
        </div>
        
        <!-- Competitive Match Status -->
        <div id="competitive-status" style="display: none; margin-top: 10px; padding: 8px; background: rgba(156, 39, 176, 0.2); border-radius: 4px; border-left: 3px solid #9C27B0;">
          <div style="font-weight: bold; color: #E1BEE7;">🏆 Competitive Match</div>
          <div id="competitive-info" style="font-size: 11px; color: #ccc; margin-top: 2px;"></div>
        </div>
      </div>
    `;

    this.uiContainer.appendChild(controlsSection);
    this.setupSessionControlEvents();
    this.populateLevelSelect();
  }

  private createChatSystem(): void {
    const chatSection = document.createElement('div');
    chatSection.id = 'chat-section';
    chatSection.innerHTML = `
      <div style="margin-bottom: 15px; border-bottom: 1px solid #555; padding-bottom: 10px;">
        <h3 style="margin: 0 0 10px 0;">Chat</h3>
        <div id="chat-messages" style="height: 120px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 4px; padding: 8px; margin-bottom: 10px; font-size: 12px; line-height: 1.4;">
          <div style="color: #888; font-style: italic;">Chat messages will appear here...</div>
        </div>
        <div style="display: flex; gap: 5px;">
          <input id="chat-input" type="text" placeholder="Type a message..." style="flex: 1; padding: 5px; border: 1px solid #555; border-radius: 4px; background: rgba(255,255,255,0.1); color: white;" maxlength="500">
          <button id="send-chat-btn" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Send</button>
        </div>
      </div>
    `;

    this.uiContainer.appendChild(chatSection);
    this.setupChatEvents();
  }

  private createPlayerManagement(): void {
    const playersSection = document.createElement('div');
    playersSection.id = 'players-section';
    playersSection.innerHTML = `
      <div style="margin-bottom: 15px; border-bottom: 1px solid #555; padding-bottom: 10px;">
        <h3 style="margin: 0 0 10px 0;">Players</h3>
        <div id="players-list" style="max-height: 100px; overflow-y: auto;">
          <div style="color: #888; font-style: italic;">No players</div>
        </div>
      </div>
    `;

    this.uiContainer.appendChild(playersSection);
  }

  private createSessionLobby(): void {
    const lobbyModal = document.createElement('div');
    lobbyModal.id = 'session-lobby-modal';
    lobbyModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      display: none;
    `;

    const lobbyContent = document.createElement('div');
    lobbyContent.style.cssText = `
      background: #2a2a2a;
      color: white;
      padding: 30px;
      border-radius: 8px;
      max-width: 500px;
      width: 90%;
      font-family: Arial, sans-serif;
    `;

    lobbyContent.innerHTML = `
      <h2 id="lobby-title">Session Lobby</h2>
      <div id="lobby-content">
        <!-- Content will be populated dynamically -->
      </div>
    `;

    lobbyModal.appendChild(lobbyContent);
    document.body.appendChild(lobbyModal);
  }

  private setupSessionControlEvents(): void {
    // Create session
    document
      .getElementById('create-session-btn')
      ?.addEventListener('click', () => {
        this.showCreateSessionModal();
      });

    // Join session
    document
      .getElementById('join-session-btn')
      ?.addEventListener('click', () => {
        this.showJoinSessionModal();
      });

    // Leave session
    document
      .getElementById('leave-session-btn')
      ?.addEventListener('click', () => {
        this.multiplayerManager.leaveSession();
      });
  }

  private setupChatEvents(): void {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const sendBtn = document.getElementById('send-chat-btn');

    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (message) {
        this.multiplayerManager.sendChatMessage(message);
        chatInput.value = '';
      }
    };

    sendBtn?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }

  private showCreateSessionModal(): void {
    const modal = document.getElementById('session-lobby-modal') as HTMLElement;
    const content = document.getElementById('lobby-content') as HTMLElement;
    const title = document.getElementById('lobby-title') as HTMLElement;

    title.textContent = 'Create Session';
    content.innerHTML = `
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Session Name:</label>
        <input id="session-name" type="text" value="My Session" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(255,255,255,0.1); color: white;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Max Players:</label>
        <select id="max-players" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(255,255,255,0.1); color: white;">
          <option value="2">2 Players</option>
          <option value="3">3 Players</option>
          <option value="4" selected>4 Players</option>
          <option value="6">6 Players</option>
        </select>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input id="is-public" type="checkbox" checked>
          <span>Public Session</span>
        </label>
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input id="allow-spectators" type="checkbox" checked>
          <span>Allow Spectators</span>
        </label>
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button onclick="closeSessionLobby()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        <button onclick="createSession()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Create</button>
      </div>
    `;

    modal.style.display = 'flex';

    // Set up global functions
    (window as any).closeSessionLobby = () => {
      modal.style.display = 'none';
    };

    (window as any).createSession = () => {
      const nameInput = document.getElementById(
        'session-name'
      ) as HTMLInputElement;
      const maxPlayersSelect = document.getElementById(
        'max-players'
      ) as HTMLSelectElement;
      const isPublicCheckbox = document.getElementById(
        'is-public'
      ) as HTMLInputElement;
      const allowSpectatorsCheckbox = document.getElementById(
        'allow-spectators'
      ) as HTMLInputElement;

      const options = {
        name: nameInput.value || 'My Session',
        maxPlayers: parseInt(maxPlayersSelect.value),
        isPublic: isPublicCheckbox.checked,
        settings: {
          allowSpectators: allowSpectatorsCheckbox.checked,
        },
      };

      this.multiplayerManager.createSession(options);
      modal.style.display = 'none';
    };
  }

  private showJoinSessionModal(): void {
    const modal = document.getElementById('session-lobby-modal') as HTMLElement;
    const content = document.getElementById('lobby-content') as HTMLElement;
    const title = document.getElementById('lobby-title') as HTMLElement;

    title.textContent = 'Join Session';
    content.innerHTML = `
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Session ID:</label>
        <input id="session-id" type="text" placeholder="Enter session ID..." style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(255,255,255,0.1); color: white;">
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 5px;">Player Name:</label>
        <input id="player-name" type="text" placeholder="Enter your name..." style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(255,255,255,0.1); color: white;">
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button onclick="closeSessionLobby()" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        <button onclick="joinSession()" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Join</button>
      </div>
    `;

    modal.style.display = 'flex';

    (window as any).joinSession = () => {
      const sessionIdInput = document.getElementById(
        'session-id'
      ) as HTMLInputElement;
      const playerNameInput = document.getElementById(
        'player-name'
      ) as HTMLInputElement;

      const sessionId = sessionIdInput.value.trim();
      const playerName = playerNameInput.value.trim() || 'Player';

      if (sessionId) {
        this.multiplayerManager.joinSession(sessionId, playerName);
        modal.style.display = 'none';
      }
    };
  }

  // Event handlers
  private onSessionJoined(session: GameSession, player: PlayerData): void {
    console.log('Session joined:', session.id);
    this.updateSessionInfo(session);
    this.updatePlayersList(session);
    this.showMultiplayerPanel();

    // Show leave button, hide join buttons
    const leaveBtn = document.getElementById(
      'leave-session-btn'
    ) as HTMLElement;
    const createBtn = document.getElementById(
      'create-session-btn'
    ) as HTMLElement;
    const joinBtn = document.getElementById('join-session-btn') as HTMLElement;

    leaveBtn.style.display = 'inline-block';
    createBtn.style.display = 'none';
    joinBtn.style.display = 'none';
  }

  private onSessionUpdated(session: GameSession): void {
    this.updateSessionInfo(session);
    this.updatePlayersList(session);
  }

  private onPlayerJoined(player: PlayerData): void {
    const session = this.multiplayerManager.getCurrentSession();
    if (session) {
      this.updatePlayersList(session);
    }
  }

  private onPlayerLeft(playerId: string): void {
    const session = this.multiplayerManager.getCurrentSession();
    if (session) {
      this.updatePlayersList(session);
    }
  }

  private onPlayerUpdated(player: PlayerData): void {
    const session = this.multiplayerManager.getCurrentSession();
    if (session) {
      this.updatePlayersList(session);
    }
  }

  private onChatMessage(message: ChatMessage): void {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      const messageElement = document.createElement('div');
      const time = new Date(message.timestamp).toLocaleTimeString([], {
        timeStyle: 'short',
      });

      let messageColor = '#fff';
      if (message.type === 'system') {
        messageColor = '#888';
      } else if (message.type === 'achievement') {
        messageColor = '#4CAF50';
      }

      messageElement.innerHTML = `
        <div style="color: ${messageColor}; margin: 2px 0;">
          <span style="font-size: 11px; color: #666;">[${time}]</span>
          <strong>${message.playerName}:</strong> ${message.message}
        </div>
      `;

      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  private onPermissionDenied(action: string, reason: string): void {
    this.showNotification(`Permission denied: ${reason}`, 'error');
  }

  private onError(error: { message: string; code: string }): void {
    this.showNotification(`Error: ${error.message}`, 'error');
  }

  // UI update methods
  private updateSessionInfo(session: GameSession): void {
    const sessionInfo = document.getElementById('session-info');
    if (sessionInfo) {
      const player = this.multiplayerManager.getLocalPlayer();
      const roleText = player?.isHost ? '👑 Host' : '👤 Player';

      sessionInfo.innerHTML = `
        <div><strong>Session:</strong> ${session.name}</div>
        <div><strong>ID:</strong> ${session.id}</div>
        <div><strong>Role:</strong> ${roleText}</div>
        <div><strong>State:</strong> ${session.sessionState}</div>
        <div><strong>Players:</strong> ${session.players.size}/${session.maxPlayers}</div>
      `;
    }
  }

  private updatePlayersList(session: GameSession): void {
    const playersList = document.getElementById('players-list');
    if (playersList) {
      const players = Array.from(session.players.values());
      const localPlayer = this.multiplayerManager.getLocalPlayer();

      if (players.length === 0) {
        playersList.innerHTML =
          '<div style="color: #888; font-style: italic;">No players</div>';
        return;
      }

      playersList.innerHTML = players
        .map(player => {
          const roleIcon = player.isHost ? '👑' : '👤';
          const statusColor = player.status === 'active' ? '#4CAF50' : '#888';
          const isLocal = player.id === localPlayer?.id;

          return `
          <div style="display: flex; align-items: center; justify-content: space-between; margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.05); border-radius: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: ${statusColor};">${roleIcon}</span>
              <span style="font-weight: ${isLocal ? 'bold' : 'normal'};">${player.name}</span>
              ${isLocal ? '<span style="color: #4CAF50; font-size: 12px;">(You)</span>' : ''}
            </div>
            <div style="font-size: 12px; color: #666;">
              ${player.role}
            </div>
          </div>
        `;
        })
        .join('');
    }
  }

  public showMultiplayerPanel(): void {
    this.uiContainer.style.display = 'block';
  }

  public hideMultiplayerPanel(): void {
    this.uiContainer.style.display = 'none';
  }

  public toggleMultiplayerPanel(): void {
    const isVisible = this.uiContainer.style.display === 'block';
    this.uiContainer.style.display = isVisible ? 'none' : 'block';
  }

  private showNotification(
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 380px;
      background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 1002;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 300px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  }

  public cleanup(): void {
    if (this.uiContainer && document.body.contains(this.uiContainer)) {
      document.body.removeChild(this.uiContainer);
    }

    const modal = document.getElementById('session-lobby-modal');
    if (modal && document.body.contains(modal)) {
      document.body.removeChild(modal);
    }
  }

  // Enhanced lobby methods
  private populateLevelSelect(): void {
    const levelSelect = document.getElementById(
      'level-select'
    ) as HTMLSelectElement;
    if (!levelSelect) return;

    // Get available competitive levels (this would come from AssignmentManager)
    const competitiveLevels = [
      {
        id: 'speed_foundation_race',
        name: '⚡ Speed Foundation Race',
        levelNumber: 6,
      },
      { id: 'drainage_duel', name: '🌊 Drainage Channel Duel', levelNumber: 7 },
      {
        id: 'precision_showdown',
        name: '🎯 Precision Earthworks Showdown',
        levelNumber: 8,
      },
    ];

    // Clear existing options except the first one
    levelSelect.innerHTML = '<option value="">Select a level...</option>';

    // Add competitive levels
    competitiveLevels.forEach(level => {
      const option = document.createElement('option');
      option.value = level.id;
      option.textContent = `Level ${level.levelNumber}: ${level.name}`;
      levelSelect.appendChild(option);
    });
  }

  private setupEnhancedSessionEvents(): void {
    // Quick Match functionality
    const quickMatchBtn = document.getElementById('quick-match-btn');
    if (quickMatchBtn) {
      quickMatchBtn.addEventListener('click', () => {
        const levelSelect = document.getElementById(
          'level-select'
        ) as HTMLSelectElement;
        if (!levelSelect.value) {
          this.showNotification('Please select a level first', 'error');
          return;
        }
        this.startQuickMatch(levelSelect.value);
      });
    }

    // Create Competitive Match
    const createCompetitiveBtn = document.getElementById(
      'create-competitive-btn'
    );
    if (createCompetitiveBtn) {
      createCompetitiveBtn.addEventListener('click', () => {
        const levelSelect = document.getElementById(
          'level-select'
        ) as HTMLSelectElement;
        if (!levelSelect.value) {
          this.showNotification('Please select a level first', 'error');
          return;
        }
        this.createCompetitiveSession(levelSelect.value);
      });
    }

    // Spectate functionality
    const spectateBtn = document.getElementById('spectate-btn');
    if (spectateBtn) {
      spectateBtn.addEventListener('click', () => {
        this.showSpectatorLobby();
      });
    }
  }

  private startQuickMatch(levelId: string): void {
    this.showNotification('🔍 Looking for opponents...', 'info');

    // Emit quick match request to server
    // Quick match functionality - socket access needs to be public or through method
    // this.multiplayerManager.socket.emit('quick-match', {
    //   levelId,
    //   playerId: this.multiplayerManager.socket.id,
    // });
  }

  private createCompetitiveSession(levelId: string): void {
    this.showNotification('🏆 Creating competitive session...', 'info');

    // Create a competitive session with the selected level
    this.multiplayerManager.createSession({
      name: `Competitive: ${levelId}`,
      maxPlayers: 4,
      isPublic: true,
      settings: {}
    });
  }

  private showSpectatorLobby(): void {
    this.showNotification('👁️ Showing active competitive matches...', 'info');

    // This would show a list of ongoing competitive matches
    // For now, just emit a spectator request
    // Request spectator sessions - socket access needs to be public
    // this.multiplayerManager.socket.emit('request-spectator-sessions');
  }
}
