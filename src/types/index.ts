/**
 * Shared TypeScript types for JNU AI Study Room Booking app
 */

/** Authentication state persisted in AsyncStorage */
export interface AuthState {
  isLoggedIn: boolean;
  userName?: string;
  userId?: string;
  /** Unix timestamp (ms) of when the session was created */
  loginTime?: number;
}

/** A single room reservation record */
export interface Reservation {
  id: string;
  date: string;       // ISO date string, e.g. "2026-06-15"
  startTime: string;  // "HH:MM", e.g. "13:00"
  endTime: string;    // "HH:MM", e.g. "15:00"
  room: string;       // Room name / number
  purpose: string;    // Usage purpose
  memberCount: number;
  status: 'confirmed' | 'pending' | 'cancelled';
}

/** Bottom tab navigator route names */
export type TabParamList = {
  index: undefined;
  reservations: undefined;
  settings: undefined;
};

/** WebView postMessage payloads sent from injected scripts */
export type WebViewMessage =
  | { type: 'userInfo'; name: string; id: string }
  | { type: 'error'; message: string }
  | { type: 'ready' };
