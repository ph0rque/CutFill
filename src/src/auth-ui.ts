import { AuthService } from './auth';

export class AuthUI {
  private authService: AuthService;
  private container: HTMLElement;

  constructor(authService: AuthService) {
    this.authService = authService;
    this.container = this.createAuthContainer();
    this.setupEventHandlers();
  }

  private createAuthContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'auth-container';
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
          Welcome to CutFill
        </h2>
        
        <div id="auth-error" style="
          background: #fee;
          color: #c33;
          padding: 0.75rem;
          border-radius: 4px;
          margin-bottom: 1rem;
          display: none;
        "></div>
        
        <div id="auth-tabs" style="
          display: flex;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #ddd;
        ">
          <button id="login-tab" class="auth-tab active" style="
            flex: 1;
            padding: 0.75rem;
            border: none;
            background: none;
            cursor: pointer;
            border-bottom: 2px solid #4CAF50;
            color: #4CAF50;
          ">Sign In</button>
          <button id="signup-tab" class="auth-tab" style="
            flex: 1;
            padding: 0.75rem;
            border: none;
            background: none;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            color: #666;
          ">Sign Up</button>
        </div>
        
        <form id="auth-form">
          <div id="login-form">
            <input type="email" id="login-email" name="email" placeholder="Email" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
            <input type="password" id="login-password" name="password" placeholder="Password" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
            <button type="submit" id="login-submit" style="
              width: 100%;
              padding: 0.75rem;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
              margin-bottom: 1rem;
            ">Sign In</button>
          </div>
          
          <div id="signup-form" style="display: none;">
            <input type="text" id="signup-username" name="username" placeholder="Username" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
            <input type="email" id="signup-email" name="email" placeholder="Email" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
            <input type="password" id="signup-password" name="password" placeholder="Password" required style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              margin-bottom: 1rem;
              box-sizing: border-box;
            ">
            <button type="submit" id="signup-submit" style="
              width: 100%;
              padding: 0.75rem;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
              margin-bottom: 1rem;
            ">Sign Up</button>
          </div>
        </form>
        
        <div style="text-align: center; margin-top: 1rem; color: #666; font-size: 0.9rem;">
          Create an account to save your progress and join multiplayer sessions!
        </div>
        
        <button id="guest-login" style="
          width: 100%;
          padding: 0.75rem;
          background: #FF9800;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          margin-top: 1rem;
        ">🎮 Continue as Guest</button>
        
        <div style="text-align: center; margin-top: 0.5rem; color: #666; font-size: 0.8rem;">
          Guest mode: Progress won't be saved
        </div>
        
        <div id="auth-loading" style="
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
    // Tab switching
    const loginTab = this.container.querySelector(
      '#login-tab'
    ) as HTMLButtonElement;
    const signupTab = this.container.querySelector(
      '#signup-tab'
    ) as HTMLButtonElement;

    loginTab.addEventListener('click', () => {
      this.switchTab('login');
      this.clearError();
    });

    signupTab.addEventListener('click', () => {
      this.switchTab('signup');
      this.clearError();
    });

    // Form submission
    const authForm = this.container.querySelector(
      '#auth-form'
    ) as HTMLFormElement;
    authForm.addEventListener('submit', e => {
      e.preventDefault();

      const activeTab = this.container.querySelector(
        '.auth-tab.active'
      ) as HTMLElement;
      if (activeTab.id === 'login-tab') {
        this.handleLogin();
      } else {
        this.handleSignup();
      }
    });

    // Guest login
    const guestBtn = this.container.querySelector(
      '#guest-login'
    ) as HTMLButtonElement;
    guestBtn.addEventListener('click', () => {
      this.handleGuestLogin();
    });
  }

  private switchTab(tab: 'login' | 'signup'): void {
    const loginTab = this.container.querySelector('#login-tab') as HTMLElement;
    const signupTab = this.container.querySelector(
      '#signup-tab'
    ) as HTMLElement;
    const loginForm = this.container.querySelector(
      '#login-form'
    ) as HTMLElement;
    const signupForm = this.container.querySelector(
      '#signup-form'
    ) as HTMLElement;

    if (tab === 'login') {
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
      loginTab.style.color = '#4CAF50';
      loginTab.style.borderBottomColor = '#4CAF50';
      signupTab.style.color = '#666';
      signupTab.style.borderBottomColor = 'transparent';
      loginForm.style.display = 'block';
      signupForm.style.display = 'none';
    } else {
      signupTab.classList.add('active');
      loginTab.classList.remove('active');
      signupTab.style.color = '#4CAF50';
      signupTab.style.borderBottomColor = '#4CAF50';
      loginTab.style.color = '#666';
      loginTab.style.borderBottomColor = 'transparent';
      signupForm.style.display = 'block';
      loginForm.style.display = 'none';
    }
  }

  private async handleLogin(): Promise<void> {
    const email = (
      this.container.querySelector('#login-email') as HTMLInputElement
    ).value;
    const password = (
      this.container.querySelector('#login-password') as HTMLInputElement
    ).value;

    if (!email || !password) {
      this.showError('Please fill in all fields');
      return;
    }

    this.showLoading(true);
    const { error } = await this.authService.signIn(email, password);
    this.showLoading(false);

    if (error) {
      this.showError(error.message);
    } else {
      this.hide();
    }
  }

  private async handleSignup(): Promise<void> {
    const username = (
      this.container.querySelector('#signup-username') as HTMLInputElement
    ).value;
    const email = (
      this.container.querySelector('#signup-email') as HTMLInputElement
    ).value;
    const password = (
      this.container.querySelector('#signup-password') as HTMLInputElement
    ).value;

    if (!username || !email || !password) {
      this.showError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      this.showError('Password must be at least 6 characters');
      return;
    }

    this.showLoading(true);
    const { error } = await this.authService.signUp(email, password, username);
    this.showLoading(false);

    if (error) {
      this.showError(error.message);
    } else {
      this.showError(
        'Account created successfully! You can now sign in.',
        'success'
      );
      // Auto-switch to login tab after successful signup
      setTimeout(() => {
        this.switchTab('login');
        this.clearError();
      }, 2000);
    }
  }

  private async handleGuestLogin(): Promise<void> {
    this.showLoading(true);
    const { error } = await this.authService.signInAsGuest();
    this.showLoading(false);

    if (error) {
      this.showError(error.message);
    } else {
      this.hide();
    }
  }

  private showError(
    message: string,
    type: 'error' | 'success' = 'error'
  ): void {
    const errorDiv = this.container.querySelector('#auth-error') as HTMLElement;
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    if (type === 'success') {
      errorDiv.style.background = '#efe';
      errorDiv.style.color = '#3c3';
    } else {
      errorDiv.style.background = '#fee';
      errorDiv.style.color = '#c33';
    }
  }

  private clearError(): void {
    const errorDiv = this.container.querySelector('#auth-error') as HTMLElement;
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
  }

  private showLoading(show: boolean): void {
    const loadingDiv = this.container.querySelector(
      '#auth-loading'
    ) as HTMLElement;
    const submitBtns = this.container.querySelectorAll(
      'button[type="submit"]'
    ) as NodeListOf<HTMLButtonElement>;
    loadingDiv.style.display = show ? 'block' : 'none';
    submitBtns.forEach(btn => (btn.disabled = show));
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
  }

  public destroy(): void {
    this.hide();
  }
}
