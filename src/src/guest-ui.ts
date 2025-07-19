import { io } from 'socket.io-client';

export class GuestUI {
  private container: HTMLElement;
  private socket: any;
  private onComplete: () => void;
  private currentLobbyId: string | null = null;
  private isInLobby = false;

  constructor(onComplete: () => void) {
    this.onComplete = onComplete;
    this.socket = io('http://localhost:3001'); // Match server port
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

    // Socket event handlers
    this.socket.on('username-taken', (data: { suggestedUsername: string }) => {
      this.showError(`Username taken. Suggested: ${data.suggestedUsername}`);
      const usernameInput = this.container.querySelector(
        '#guest-username'
      ) as HTMLInputElement;
      usernameInput.value = data.suggestedUsername;
    });

    this.socket.on(
      'guest-registered',
      (data: {
        username: string;
        tempGuestId: string;
        ageRange: string;
        mode: string;
      }) => {
        localStorage.setItem(
          'guestData',
          JSON.stringify({
            username: data.username,
            tempGuestId: data.tempGuestId,
            ageRange: data.ageRange,
            mode: data.mode,
          })
        );
        
        // If competition mode, join competitive lobby
        if (data.mode === 'competition') {
          this.joinCompetitiveLobby(data);
        } else {
          // Solo mode - proceed directly to game
          this.hide();
          this.onComplete();
        }
      }
    );

    // Competitive lobby events
    this.socket.on('competitive-lobby-joined', (data: any) => {
      this.showLobby(data);
    });

    this.socket.on('lobby-updated', (data: any) => {
      this.updateLobby(data);
    });

    this.socket.on('match-starting', (data: any) => {
      this.startMatchCountdown(data.countdown || 3);
    });

    this.socket.on('match-started', (data: any) => {
      this.hide();
      this.onComplete();
    });

    this.socket.on('lobby-error', (data: any) => {
      this.showError(data.message || 'Lobby error occurred');
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

    this.showLoading();
    this.socket.emit('register-guest', { desiredUsername: username, ageRange, mode });
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
    this.socket.disconnect();
  }

  private joinCompetitiveLobby(guestData: any): void {
    this.socket.emit('join-competitive-lobby', {
      username: guestData.username,
      ageRange: guestData.ageRange,
      tempGuestId: guestData.tempGuestId
    });
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
    playerCountElement.textContent = lobbyData.playerCount || '1';

    // Update players list
    if (lobbyData.players && playersListElement) {
      playersListElement.innerHTML = lobbyData.players.map((player: any) => 
        `<div style="padding: 0.25rem 0; border-bottom: 1px solid #eee;">
          <span style="font-weight: bold;">${player.username}</span>
          <span style="color: #666; font-size: 0.9rem;"> (${player.ageRange})</span>
          ${player.ready ? '<span style="color: #4CAF50; margin-left: 0.5rem;">✓ Ready</span>' : ''}
        </div>`
      ).join('');
    }

    // Update status
    if (lobbyStatusElement) {
      const readyBtn = this.container.querySelector('#ready-btn') as HTMLElement;
      
      if (lobbyData.playerCount >= 2) {
        lobbyStatusElement.innerHTML = '🎮 Ready to start! Players can ready up.';
        lobbyStatusElement.style.background = '#e8f5e8';
        lobbyStatusElement.style.color = '#2e7d32';
        
        // Show ready button
        readyBtn.style.display = 'block';
      } else {
        lobbyStatusElement.innerHTML = '⏳ Waiting for more players...';
        lobbyStatusElement.style.background = '#e3f2fd';
        lobbyStatusElement.style.color = '#1976d2';
        
        // Hide ready button
        readyBtn.style.display = 'none';
      }
    }
  }

  private leaveLobby(): void {
    if (this.currentLobbyId) {
      this.socket.emit('leave-competitive-lobby', { lobbyId: this.currentLobbyId });
    }
    this.returnToSetup();
  }

  private toggleReady(): void {
    if (this.currentLobbyId) {
      this.socket.emit('toggle-ready', { lobbyId: this.currentLobbyId });
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
