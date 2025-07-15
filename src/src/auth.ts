import { supabase, type User } from './supabase';
import type { AuthError, User as SupabaseUser } from '@supabase/supabase-js';

export interface AuthState {
  user: SupabaseUser | null;
  isLoading: boolean;
  error: string | null;
}

export class AuthService {
  private authState: AuthState = {
    user: null,
    isLoading: true,
    error: null,
  };

  private listeners: Array<(state: AuthState) => void> = [];

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      // Get initial session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        this.updateAuthState({ error: error.message });
        return;
      }

      this.updateAuthState({
        user: session?.user || null,
        isLoading: false,
      });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        this.updateAuthState({
          user: session?.user || null,
          isLoading: false,
        });
      });
    } catch (error) {
      this.updateAuthState({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  }

  private updateAuthState(updates: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...updates };
    this.listeners.forEach(listener => listener(this.authState));
  }

  public onAuthStateChange(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  public async signUp(
    email: string,
    password: string,
    username: string
  ): Promise<{ error: AuthError | null }> {
    try {
      this.updateAuthState({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
          },
        },
      });

      if (error) {
        this.updateAuthState({ error: error.message, isLoading: false });
        return { error };
      }

      // Create user profile
      if (data.user) {
        await this.createUserProfile(data.user.id, email, username);
      }

      this.updateAuthState({ isLoading: false });
      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      this.updateAuthState({ error: message, isLoading: false });
      return { error: { message } as AuthError };
    }
  }

  public async signIn(
    email: string,
    password: string
  ): Promise<{ error: AuthError | null }> {
    try {
      this.updateAuthState({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        this.updateAuthState({ error: error.message, isLoading: false });
        return { error };
      }

      this.updateAuthState({ user: data.user, isLoading: false });
      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      this.updateAuthState({ error: message, isLoading: false });
      return { error: { message } as AuthError };
    }
  }

  public async signOut(): Promise<void> {
    try {
      this.updateAuthState({ isLoading: true, error: null });

      const { error } = await supabase.auth.signOut();

      if (error) {
        this.updateAuthState({ error: error.message, isLoading: false });
        return;
      }

      this.updateAuthState({ user: null, isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Sign out failed';
      this.updateAuthState({ error: message, isLoading: false });
    }
  }

  public async signInAsGuest(): Promise<{ error: AuthError | null }> {
    try {
      this.updateAuthState({ isLoading: true, error: null });

      // Generate a random guest email and password
      const guestId = Math.random().toString(36).substring(2, 15);
      const guestEmail = `guest_${guestId}@cutfill.local`;
      const guestPassword = Math.random().toString(36).substring(2, 15);
      const guestUsername = `Guest_${guestId}`;

      const { data, error } = await supabase.auth.signUp({
        email: guestEmail,
        password: guestPassword,
        options: {
          data: {
            username: guestUsername,
            is_guest: true,
          },
        },
      });

      if (error) {
        this.updateAuthState({ error: error.message, isLoading: false });
        return { error };
      }

      // Create guest user profile
      if (data.user) {
        await this.createUserProfile(data.user.id, guestEmail, guestUsername);
      }

      this.updateAuthState({ user: data.user, isLoading: false });
      return { error: null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Guest sign in failed';
      this.updateAuthState({ error: message, isLoading: false });
      return { error: { message } as AuthError };
    }
  }

  private async createUserProfile(
    userId: string,
    email: string,
    username: string
  ): Promise<void> {
    try {
      const { error } = await supabase.from('users').insert([
        {
          id: userId,
          email,
          username,
        },
      ]);

      if (error) {
        console.error('Error creating user profile:', error);
      }
    } catch (error) {
      console.error('Error creating user profile:', error);
    }
  }

  public async getUserProfile(userId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  public async updateUserProgress(
    userId: string,
    progress: Partial<{
      level: number;
      experience: number;
      assignments_completed: number;
      total_volume_moved: number;
    }>
  ): Promise<void> {
    try {
      const { error } = await supabase.from('user_progress').upsert({
        user_id: userId,
        ...progress,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error updating user progress:', error);
      }
    } catch (error) {
      console.error('Error updating user progress:', error);
    }
  }

  public getCurrentUser(): SupabaseUser | null {
    return this.authState.user;
  }

  public isAuthenticated(): boolean {
    return this.authState.user !== null;
  }

  public isLoading(): boolean {
    return this.authState.isLoading;
  }

  public getError(): string | null {
    return this.authState.error;
  }

  public clearError(): void {
    this.updateAuthState({ error: null });
  }
}
