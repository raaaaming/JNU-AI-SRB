import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthState } from '../types';

const STORAGE_KEY = 'auth_state';

/** Session duration: 8 hours in milliseconds */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

const DEFAULT_STATE: AuthState = {
  isLoggedIn: false,
};

/**
 * Custom hook that manages authentication state.
 *
 * - Persists state in AsyncStorage under `auth_state`
 * - Automatically invalidates sessions older than 8 hours
 * - Exposes `login`, `logout`, and reactive `isLoggedIn`
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);

  // Load persisted state on mount
  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed: AuthState = JSON.parse(raw);

          // Check session expiry
          if (
            parsed.isLoggedIn &&
            parsed.loginTime &&
            Date.now() - parsed.loginTime > SESSION_DURATION_MS
          ) {
            // Session expired — clear it
            await AsyncStorage.removeItem(STORAGE_KEY);
            setAuthState(DEFAULT_STATE);
          } else {
            setAuthState(parsed);
          }
        }
      } catch {
        // Corrupt storage — reset
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        setAuthState(DEFAULT_STATE);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAuthState();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Call after successful SSO login */
  const login = useCallback(async (userName?: string, userId?: string) => {
    const newState: AuthState = {
      isLoggedIn: true,
      userName,
      userId,
      loginTime: Date.now(),
    };
    setAuthState(newState);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch {
      // Non-fatal — state is still updated in memory
    }
  }, []);

  /** Call to log the user out and clear stored credentials */
  const logout = useCallback(async () => {
    setAuthState(DEFAULT_STATE);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // Non-fatal
    }
  }, []);

  return {
    isLoggedIn: authState.isLoggedIn,
    userName: authState.userName,
    userId: authState.userId,
    loginTime: authState.loginTime,
    isLoading,
    login,
    logout,
  };
}
