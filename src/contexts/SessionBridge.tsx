import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';

import { URLS } from '../constants/urls';
import { useAuth } from './AuthContext';

/**
 * SessionBridge
 * -------------
 * A single, app-wide hidden WebView kept on the cvg.jnu.ac.kr domain. It acts
 * as an *authenticated HTTP/automation conduit*: the SSO session cookie lives
 * in the WebView's cookie store (RN's fetch can't share it on Android), so all
 * data fetching and reservation actions are performed by injecting JS that runs
 * inside this page and posts results back.
 *
 * The UI everywhere else is fully native; this WebView is never shown.
 *
 * `run()` serializes calls through a queue (each operation may navigate the
 * page, so only one runs at a time) and resolves with the script's result.
 *
 * Injected scripts must post messages shaped as:
 *   { __bridge: reqId, kind: 'progress', step: string }
 *   { __bridge: reqId, kind: 'result', ok: boolean, data?: any, error?: string }
 */

export type ProgressHandler = (step: string) => void;

export interface BridgeRunOptions {
  timeoutMs?: number;
  onProgress?: ProgressHandler;
  /**
   * For operations whose success is a page navigation (e.g. a reservation
   * submit POSTs and navigates away, tearing down the injected script before
   * it can report back). When set, a full navigation while the op is pending
   * resolves it with this factory's value instead of timing out.
   */
  resolveOnNavigation?: () => unknown;
}

export interface SessionBridgeValue {
  /** Whether the conduit page has finished loading at least once. */
  ready: boolean;
  /** Inject a script (built with the request id) and await its result. */
  run<T = unknown>(
    buildScript: (reqId: string) => string,
    options?: BridgeRunOptions,
  ): Promise<T>;
  /** Force a reload of the conduit page (e.g. after a session refresh). */
  reload(): void;
  /**
   * Logs the SSO session out inside the conduit page (clicks the site's logout
   * control) so the session cookie is expired server-side. Resolves once the
   * logout navigation has had time to complete; safe to call before clearing
   * local auth state.
   */
  logout(): Promise<void>;
}

const SessionBridgeContext = createContext<SessionBridgeValue | undefined>(undefined);

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressHandler;
  timer: ReturnType<typeof setTimeout>;
  /** If set, a full navigation resolves the op with this value (see options). */
  onNavigate?: () => unknown;
}

let reqCounter = 0;
function nextReqId(): string {
  reqCounter += 1;
  return `r${Date.now().toString(36)}_${reqCounter}`;
}

/** True when a URL is the booking-calendar conduit page (vs. a drifted page). */
function isCalendarUrl(url: string): boolean {
  return url.indexOf('/cvg/17459/subview.do') !== -1;
}

export function SessionBridgeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // Mirror of `ready` for synchronous reads inside async tasks (no stale closure).
  const readyRef = useRef(false);
  // Latest URL the conduit WebView is on (to detect drift off the calendar).
  const currentUrlRef = useRef<string>('');

  // Pending requests by id
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  // Simple FIFO queue so only one navigation-based op runs at a time
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Resolves once the page is loaded; lets run() wait for readiness
  const readyWaitersRef = useRef<Array<() => void>>([]);

  const handleLoadEnd = useCallback(() => {
    readyRef.current = true;
    setReady(true);
    const waiters = readyWaitersRef.current;
    readyWaitersRef.current = [];
    waiters.forEach((w) => w());
  }, []);

  const handleLoadStart = useCallback(() => {
    // A full navigation (e.g. after submitting a reservation) is in flight —
    // hold operations until it settles so we never inject into a half-loaded page.
    readyRef.current = false;
    setReady(false);
    // A navigation is the success signal for ops that opted into it (the
    // submit's form POST navigated away). Resolve them now rather than waiting
    // for a result message that the torn-down script can never send.
    pendingRef.current.forEach((p, id) => {
      if (!p.onNavigate) return;
      clearTimeout(p.timer);
      pendingRef.current.delete(id);
      try {
        p.resolve(p.onNavigate());
      } catch {
        p.resolve(undefined);
      }
    });
  }, []);

  /** Resolves when the conduit page is loaded; rejects if it stays unready. */
  const waitForReady = useCallback((timeoutMs = 12000) => {
    return new Promise<void>((resolve, reject) => {
      if (webRef.current && readyRef.current) {
        resolve();
        return;
      }
      let settled = false;
      const waiter = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        readyWaitersRef.current = readyWaitersRef.current.filter((w) => w !== waiter);
        reject(new Error('세션 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'));
      }, timeoutMs);
      readyWaitersRef.current.push(waiter);
    });
  }, []);

  /** Force the conduit back to the calendar page (e.g. after a submit nav). */
  const resetToCalendar = useCallback(() => {
    readyRef.current = false;
    setReady(false);
    webRef.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(URLS.BOOKING_CALENDAR)}); true;`,
    );
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    const reqId: string | undefined = msg?.__bridge;
    if (!reqId) return;
    const pending = pendingRef.current.get(reqId);
    if (!pending) return;

    if (msg.kind === 'progress') {
      pending.onProgress?.(String(msg.step ?? ''));
      return;
    }
    if (msg.kind === 'result') {
      clearTimeout(pending.timer);
      pendingRef.current.delete(reqId);
      if (msg.ok) pending.resolve(msg.data);
      else pending.reject(new Error(msg.error || '요청을 처리하지 못했습니다.'));
    }
  }, []);

  const run = useCallback(
    <T,>(buildScript: (reqId: string) => string, options?: BridgeRunOptions): Promise<T> => {
      const task = async (): Promise<T> => {
        await waitForReady();
        // If the page drifted off the calendar (a reservation submit navigates
        // away), restore it before injecting — otherwise the calendar/scrape
        // functions are missing and every op would silently time out.
        if (currentUrlRef.current && !isCalendarUrl(currentUrlRef.current)) {
          resetToCalendar();
          await waitForReady();
        }
        const reqId = nextReqId();
        const timeoutMs = options?.timeoutMs ?? 25000;

        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingRef.current.delete(reqId);
            reject(new Error('시간이 초과되었습니다. 네트워크를 확인해주세요.'));
          }, timeoutMs);

          pendingRef.current.set(reqId, {
            resolve,
            reject,
            onProgress: options?.onProgress,
            timer,
            onNavigate: options?.resolveOnNavigation,
          });

          const script = buildScript(reqId);
          webRef.current?.injectJavaScript(script);
        });
      };

      // Chain onto the queue; isolate failures so the queue keeps flowing.
      const queued = queueRef.current.then(task, task);
      queueRef.current = queued.catch(() => undefined);
      return queued as Promise<T>;
    },
    [waitForReady, resetToCalendar],
  );

  const reload = useCallback(() => {
    readyRef.current = false;
    setReady(false);
    webRef.current?.reload();
  }, []);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    currentUrlRef.current = navState.url ?? '';
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // End the IdP session at its authoritative logout endpoint (not just the
    // cvg page's local logout link, which leaves the SSO session alive and
    // causes the next visit to auto-log-in). Wait for it to process before the
    // caller tears the conduit down.
    readyRef.current = false;
    setReady(false);
    try {
      webRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(URLS.SSO_LOGOUT)}; true;`,
      );
    } catch {
      // ignore — proceed to clear local state regardless
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 2500));
  }, []);

  const value: SessionBridgeValue = { ready, run, reload, logout };

  return (
    <SessionBridgeContext.Provider value={value}>
      {children}
      {/* The conduit WebView only mounts once the user is authenticated. */}
      {auth.isLoggedIn ? (
        <View style={styles.hidden} pointerEvents="none">
          <WebView
            ref={webRef}
            source={{ uri: URLS.BOOKING_CALENDAR }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            mixedContentMode={Platform.OS === 'android' ? 'compatibility' : undefined}
          />
        </View>
      ) : null}
    </SessionBridgeContext.Provider>
  );
}

export function useSessionBridge(): SessionBridgeValue {
  const ctx = useContext(SessionBridgeContext);
  if (ctx === undefined) {
    throw new Error('useSessionBridge must be used within a SessionBridgeProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    bottom: 0,
    right: 0,
    opacity: 0,
  },
});
