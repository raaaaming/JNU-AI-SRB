import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthState } from '../types';

const STORAGE_KEY = 'auth_state';

/**
 * Session duration: 30 days.
 *
 * The school SSO supports registering a "trusted device" at code entry, which
 * keeps the session alive for ~1 month via the WebView's persisted cookies. We
 * match that window here so the app doesn't sign the user out while their SSO
 * session is still valid. (If the SSO cookie actually expires sooner, the
 * bridge's data calls will fail and the user is routed back to login anyway.)
 */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_STATE: AuthState = {
  isLoggedIn: false,
};

export interface AuthContextValue {
  isLoggedIn: boolean;
  userName?: string;
  userId?: string;
  loginTime?: number;
  isLoading: boolean;
  login: (userName?: string, userId?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provides a single, app-wide authentication state.
 *
 * Using a Context (rather than per-component `useState`) ensures that
 * logging in on the login screen immediately updates the root layout's
 * routing guard — otherwise a freshly logged-in user would be bounced
 * back to /login because the layout still held stale `isLoggedIn: false`.
 *
 * - Persists state in AsyncStorage under `auth_state`
 * - Automatically invalidates sessions older than 8 hours
 */
export function AuthProvider({ children }: { children: ReactNode }) {
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
            if (!cancelled) setAuthState(DEFAULT_STATE);
          } else if (!cancelled) {
            setAuthState(parsed);
          }
        }
      } catch {
        // Corrupt storage — reset
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        if (!cancelled) setAuthState(DEFAULT_STATE);
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

  const value: AuthContextValue = {
    isLoggedIn: authState.isLoggedIn,
    userName: authState.userName,
    userId: authState.userId,
    loginTime: authState.loginTime,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Consume the shared auth state.
 * Must be used within an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
