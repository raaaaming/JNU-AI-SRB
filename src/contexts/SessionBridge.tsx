import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

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
}

const SessionBridgeContext = createContext<SessionBridgeValue | undefined>(undefined);

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressHandler;
  timer: ReturnType<typeof setTimeout>;
}

let reqCounter = 0;
function nextReqId(): string {
  reqCounter += 1;
  return `r${Date.now().toString(36)}_${reqCounter}`;
}

export function SessionBridgeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  // Pending requests by id
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  // Simple FIFO queue so only one navigation-based op runs at a time
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Resolves once the page is loaded; lets run() wait for readiness
  const readyWaitersRef = useRef<Array<() => void>>([]);

  const handleLoadEnd = useCallback(() => {
    setReady(true);
    const waiters = readyWaitersRef.current;
    readyWaitersRef.current = [];
    waiters.forEach((w) => w());
  }, []);

  const waitForReady = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (webRef.current && ready) resolve();
      else readyWaitersRef.current.push(resolve);
    });
  }, [ready]);

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
    [waitForReady],
  );

  const reload = useCallback(() => {
    setReady(false);
    webRef.current?.reload();
  }, []);

  const value: SessionBridgeValue = { ready, run, reload };

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
            onLoadEnd={handleLoadEnd}
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
