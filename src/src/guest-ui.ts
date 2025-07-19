import { SupabaseMultiplayer } from './supabase-multiplayer';
import { Terrain } from './terrain';

export class GuestUI {
  private container: HTMLElement;
  private multiplayer: SupabaseMultiplayer;
  private onComplete: () => void;
  private currentLobbyId: string | null = null;
  private isInLobby = false;

  constructor(onComplete: () => void) {
    this.onComplete = onComplete;
    // Create a placeholder terrain for the multiplayer client
    // This will be replaced with the actual terrain when joining a session
    const placeholderTerrain = {} as Terrain;
    this.multiplayer = new SupabaseMultiplayer(placeholderTerrain);
    this.container = this.createContainer();
    this.setupEventHandlers();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'guest-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      font-family: Arial, sans-serif;
    `;

    container.innerHTML = `
      <div style="
        background: white;
        border-radius: 8px;
        padding: 2rem;
        width: 400px;
        max-width: 90vw;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      ">
        <!-- Initial Setup Form -->
        <div id="setup-screen">
          <h2 style="text-align: center; color: #333; margin-bottom: 1.5rem;">
            Welcome to CutFill - Guest Setup
          </h2>
          
          <div id="guest-error" style="
            background: #fee;
            color: #c33;
            padding: 0.75rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            display: none;
          "></div>
          
          <form id="guest-form">
            <input type="text" id="guest-username" placeholder="Choose a username" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
            <select id="guest-agerange" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
              <option value="">Select age range</option>
              <option value="8-12">8-12 (Kids)</option>
              <option value="13-25">13-25 (Teens/Young Adults)</option>
              <option value="26+">26+ (Professionals)</option>
            </select>
            <div style="margin-bottom: 1rem;">
              <label>Mode:</label>
              <div>
                <input type="radio" id="mode-solo" name="mode" value="solo" checked>
                <label for="mode-solo">Solo (Practice)</label>
              </div>
              <div>
                <input type="radio" id="mode-competition" name="mode" value="competition">
                <label for="mode-competition">Competition</label>
              </div>
            </div>
            <button type="submit" style="
              width: 100%;
              padding: 0.75rem;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
            ">Start Playing</button>
          </form>
          
          <div id="guest-loading" style="
            display: none;
            text-align: center;
            margin-top: 1rem;
            color: #666;
          ">
            Loading...
          </div>
        </div>

        <!-- Competitive Lobby Screen -->
        <div id="lobby-screen" style="display: none;">
          <h2 style="text-align: center; color: #333; margin-bottom: 1rem;">
            🏆 Competitive Lobby
          </h2>
          
          <div id="lobby-status" style="
            text-align: center;
            background: #e3f2fd;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            color: #1976d2;
          ">
            Waiting for opponents...
          </div>
          
          <div id="lobby-info" style="
            margin-bottom: 1rem;
            padding: 0.75rem;
            background: #f5f5f5;
            border-radius: 4px;
          ">
            <div><strong>Lobby ID:</strong> <span id="current-lobby-id">-</span></div>
            <div><strong>Players:</strong> <span id="player-count">1</span>/4</div>
            <div><strong>Mode:</strong> Competitive</div>
          </div>
          
          <div id="lobby-players" style="
            margin-bottom: 1rem;
            max-height: 150px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 0.5rem;
          ">
            <div style="font-weight: bold; margin-bottom: 0.5rem;">Players in Lobby:</div>
            <div id="players-list">
              <!-- Players will be populated here -->
            </div>
          </div>
          
          <div id="lobby-actions" style="display: flex; gap: 0.5rem;">
            <button id="leave-lobby-btn" style="
              flex: 1;
              padding: 0.75rem;
              background: #f44336;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            ">Leave Lobby</button>
            <button id="ready-btn" style="
              flex: 1;
              padding: 0.75rem;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              display: none;
            ">Ready</button>
          </div>
          
          <div id="lobby-timer" style="
            text-align: center;
            margin-top: 1rem;
            color: #666;
            font-size: 0.9rem;
            display: none;
          ">
            Match starting in <span id="countdown">3</span>...
          </div>
        </div>
      </div>
    `;
    return container;
  }

  private setupEventHandlers(): void {
    const form = this.container.querySelector('#guest-form') as HTMLFormElement;
    form.addEventListener('submit', e => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Leave lobby button
    const leaveLobbyBtn = this.container.querySelector('#leave-lobby-btn');
    leaveLobbyBtn?.addEventListener('click', () => {
      this.leaveLobby();
    });

    // Ready button
    const readyBtn = this.container.querySelector('#ready-btn');
    readyBtn?.addEventListener('click', () => {
      this.toggleReady();
    });

    // Multiplayer event handlers using Supabase
    this.multiplayer.on('session-created', (data: any) => {
      console.log('Session created:', data);
    });

    this.multiplayer.on('session-joined', (data: any) => {
      console.log('Session joined:', data);
      this.hideLoading();
      this.hide();
      this.onComplete();
    });

    this.multiplayer.on('competitive-lobby-joined', (data: any) => {
      console.log('Competitive lobby joined:', data);
      this.hideLoading();
      this.showLobby(data.lobby);
    });

    this.multiplayer.on('lobby-updated', (data: any) => {
      console.log('Lobby updated:', data);
      this.updateLobby(data.lobby);
    });

    this.multiplayer.on('lobby-player-joined', (data: any) => {
      console.log('Player joined lobby:', data.playerName);
    });

    this.multiplayer.on('lobby-player-left', (data: any) => {
      console.log('Player left lobby:', data.playerName);
    });

    this.multiplayer.on('match-starting', (data: any) => {
      console.log('Match starting countdown');
      this.startMatchCountdown(data.countdown);
    });

    this.multiplayer.on('match-started', (data: any) => {
      console.log('Match started!');
      this.hideLoading();
      this.hide();
      this.onComplete();
    });

    this.multiplayer.on('competitive-lobby-left', () => {
      console.log('Left competitive lobby');
      this.returnToSetup();
    });

    this.multiplayer.on('error', (data: any) => {
      this.showError(data.message || 'Connection error occurred');
      this.hideLoading();
    });
  }

  private handleSubmit(): void {
    const usernameInput = this.container.querySelector(
      '#guest-username'
    ) as HTMLInputElement;
    const ageRangeSelect = this.container.querySelector(
      '#guest-agerange'
    ) as HTMLSelectElement;
    const modeRadios = this.container.querySelectorAll(
      'input[name="mode"]'
    ) as NodeListOf<HTMLInputElement>;

    const username = usernameInput.value.trim();
    const ageRange = ageRangeSelect.value;
    const mode = Array.from(modeRadios).find(radio => radio.checked)?.value;

    if (!username || !ageRange || !mode) {
      this.showError('Please fill in all fields');
      return;
    }

    // Generate guest data locally instead of using server
    const tempGuestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const guestData = {
      username,
      tempGuestId,
      ageRange,
      mode
    };
    
    localStorage.setItem('guestData', JSON.stringify(guestData));
    
    this.showLoading();
      
      if (mode === 'competition') {
      // Join competitive lobby using Supabase
      this.joinCompetitiveLobby(guestData);
    } else {
      // Solo mode - proceed directly to game
        setTimeout(() => {
        this.hideLoading();
        this.hide();
        this.onComplete();
      }, 1000);
      }
  }

  private showError(message: string): void {
    const errorDiv = this.container.querySelector(
      '#guest-error'
    ) as HTMLElement;
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  private showLoading(show: boolean = true): void {
    const loadingDiv = this.container.querySelector(
      '#guest-loading'
    ) as HTMLElement;
    loadingDiv.style.display = show ? 'block' : 'none';
  }

  private hideLoading(): void {
    const loadingDiv = this.container.querySelector(
      '#guest-loading'
    ) as HTMLElement;
    loadingDiv.style.display = 'none';
  }

  private hideError(): void {
    const errorDiv = this.container.querySelector(
      '#guest-error'
    ) as HTMLElement;
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }

  public show(): void {
    this.container.style.display = 'flex';
    document.body.appendChild(this.container);
  }

  public hide(): void {
    this.container.style.display = 'none';
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    // Cleanup multiplayer connection
    this.multiplayer.disconnect();
  }

  private async joinCompetitiveLobby(guestData: any): Promise<void> {
    try {
    console.log('Joining competitive lobby:', guestData);
      await this.multiplayer.joinCompetitiveLobby(guestData.username, guestData.ageRange);
      // Success will be handled by event handlers
    } catch (error) {
      console.error('Failed to join competitive lobby:', error);
      this.hideLoading();
      this.showError('Failed to join competitive lobby. Please try again.');
    }
  }

  private showLobby(lobbyData: any): void {
    this.isInLobby = true;
    this.currentLobbyId = lobbyData.lobbyId;
    
    // Hide setup screen and show lobby screen
    const setupScreen = this.container.querySelector('#setup-screen') as HTMLElement;
    const lobbyScreen = this.container.querySelector('#lobby-screen') as HTMLElement;
    
    setupScreen.style.display = 'none';
    lobbyScreen.style.display = 'block';
    
    this.updateLobby(lobbyData);
  }

  private updateLobby(lobbyData: any): void {
    // Update lobby info
    const lobbyIdElement = this.container.querySelector('#current-lobby-id') as HTMLElement;
    const playerCountElement = this.container.querySelector('#player-count') as HTMLElement;
    const playersListElement = this.container.querySelector('#players-list') as HTMLElement;
    const lobbyStatusElement = this.container.querySelector('#lobby-status') as HTMLElement;

    lobbyIdElement.textContent = lobbyData.lobbyId || this.currentLobbyId || '-';
    playerCountElement.textContent = `${lobbyData.currentPlayers || lobbyData.players?.length || 1}`;

    // Update players list
    if (lobbyData.players && playersListElement) {
      playersListElement.innerHTML = lobbyData.players.map((player: any) => 
        `<div style="padding: 0.25rem 0; border-bottom: 1px solid #eee;">
          <span style="font-weight: bold;">${player.playerName}</span>
          ${player.isReady ? '<span style="color: #4CAF50; margin-left: 0.5rem;">✓ Ready</span>' : '<span style="color: #999; margin-left: 0.5rem;">⏳ Not Ready</span>'}
        </div>`
      ).join('');
    }

    // Update status and ready button visibility
    if (lobbyStatusElement) {
      const readyBtn = this.container.querySelector('#ready-btn') as HTMLElement;
      const playerCount = lobbyData.currentPlayers || lobbyData.players?.length || 1;
      
      if (playerCount >= 2) {
        const readyCount = lobbyData.players?.filter((p: any) => p.isReady).length || 0;
        
        if (lobbyData.status === 'starting') {
          lobbyStatusElement.innerHTML = '🚀 Match starting soon!';
          lobbyStatusElement.style.background = '#fff3cd';
          lobbyStatusElement.style.color = '#856404';
          readyBtn.style.display = 'none';
        } else if (readyCount === playerCount) {
          lobbyStatusElement.innerHTML = '✅ All players ready! Starting match...';
          lobbyStatusElement.style.background = '#d4edda';
          lobbyStatusElement.style.color = '#155724';
          readyBtn.style.display = 'none';
        } else {
          lobbyStatusElement.innerHTML = `🎮 ${readyCount}/${playerCount} players ready. Click Ready when prepared!`;
          lobbyStatusElement.style.background = '#e8f5e8';
          lobbyStatusElement.style.color = '#2e7d32';
        readyBtn.style.display = 'block';
        }
      } else {
        lobbyStatusElement.innerHTML = '⏳ Waiting for more players... (minimum 2)';
        lobbyStatusElement.style.background = '#e3f2fd';
        lobbyStatusElement.style.color = '#1976d2';
        readyBtn.style.display = 'none';
      }
    }
  }

  private async leaveLobby(): Promise<void> {
    if (this.currentLobbyId) {
      console.log('Leaving lobby:', this.currentLobbyId);
      try {
        await this.multiplayer.leaveLobby();
        // Success will be handled by event handlers (competitive-lobby-left)
      } catch (error) {
        console.error('Error leaving lobby:', error);
        this.returnToSetup(); // Fallback
      }
    } else {
      this.returnToSetup();
    }
  }

  private async toggleReady(): Promise<void> {
    if (this.currentLobbyId) {
      console.log('Toggling ready state for lobby:', this.currentLobbyId);
      try {
        await this.multiplayer.toggleReady();
        // Updates will be handled by lobby-updated event
      } catch (error) {
        console.error('Error toggling ready state:', error);
        this.showError('Failed to update ready state');
      }
    }
  }

  private startMatchCountdown(seconds: number): void {
    const timerElement = this.container.querySelector('#lobby-timer') as HTMLElement;
    const countdownElement = this.container.querySelector('#countdown') as HTMLElement;
    
    timerElement.style.display = 'block';
    
    let countdown = seconds;
    const interval = setInterval(() => {
      countdownElement.textContent = countdown.toString();
      countdown--;
      
      if (countdown < 0) {
        clearInterval(interval);
      }
    }, 1000);
  }

  private returnToSetup(): void {
    this.isInLobby = false;
    this.currentLobbyId = null;
    
    const setupScreen = this.container.querySelector('#setup-screen') as HTMLElement;
    const lobbyScreen = this.container.querySelector('#lobby-screen') as HTMLElement;
    
    setupScreen.style.display = 'block';
    lobbyScreen.style.display = 'none';
    
    // Clear any errors
    this.hideError();
    this.hideLoading();
  }
}
