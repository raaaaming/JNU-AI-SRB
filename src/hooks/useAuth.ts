/**
 * Re-export of the shared auth hook.
 *
 * The actual implementation lives in AuthContext so that every screen
 * reads from one shared state instance (see contexts/AuthContext.tsx).
 * Screens import from this path for convenience.
 */
export { useAuth } from '../contexts/AuthContext';
export type { AuthContextValue } from '../contexts/AuthContext';
