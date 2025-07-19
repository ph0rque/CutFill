import { io } from 'socket.io-client';

export class GuestUI {
  private container: HTMLElement;
  private socket: any;
  private onComplete: () => void;

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
    `;
    return container;
  }

  private setupEventHandlers(): void {
    const form = this.container.querySelector('#guest-form') as HTMLFormElement;
    form.addEventListener('submit', e => {
      e.preventDefault();
      this.handleSubmit();
    });

    this.socket.on('username-taken', (data: { suggestedUsername: string }) => {
      this.showError(`Username taken. Suggested: ${data.suggestedUsername}`);
      const usernameInput = this.container.querySelector(
        '#guest-username'
      ) as HTMLInputElement;
      usernameInput.value = data.suggestedUsername;
      // Could add a confirm button, but for now auto-suggest in input
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
        this.hide();
        this.onComplete();
      }
    );
  }

  private async handleSubmit(): Promise<void> {
    const username = (
      this.container.querySelector('#guest-username') as HTMLInputElement
    ).value.trim();
    const ageRange = (
      this.container.querySelector('#guest-agerange') as HTMLSelectElement
    ).value;
    const mode =
      (
        this.container.querySelector(
          'input[name="mode"]:checked'
        ) as HTMLInputElement
      )?.value || 'solo';

    if (!username || !ageRange) {
      this.showError('Please fill in username and age range');
      return;
    }

    if (
      username.length < 3 ||
      username.length > 20 ||
      !/^[a-zA-Z0-9]+$/.test(username)
    ) {
      this.showError('Username must be 3-20 alphanumeric characters');
      return;
    }

    this.showLoading(true);
    this.socket.emit('register-guest', {
      desiredUsername: username,
      ageRange,
      mode,
    });
    // Note: mode will be handled in integration task
  }

  private showError(message: string): void {
    const errorDiv = this.container.querySelector(
      '#guest-error'
    ) as HTMLElement;
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  private showLoading(show: boolean): void {
    const loadingDiv = this.container.querySelector(
      '#guest-loading'
    ) as HTMLElement;
    loadingDiv.style.display = show ? 'block' : 'none';
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
}
