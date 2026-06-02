import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import WebView, {
  type WebViewNavigation,
  type WebViewMessageEvent,
} from 'react-native-webview';

import { useAuth } from '@/hooks/useAuth';
import { URLS } from '@/constants/urls';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { AUTH_PROBE_SCRIPT } from '@/utils/webviewScripts';

/**
 * Login screen.
 *
 * Shows the JNU SSO login page inside a WebView.
 * When the WebView navigates to cvg.jnu.ac.kr after authentication,
 * we detect the redirect, extract user info, persist the auth state,
 * and push the user into the main (tabs) layout.
 */
export default function LoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  // Ensures we navigate into the app exactly once.
  const completedRef = useRef(false);
  // Latest URL the WebView is on.
  const currentUrlRef = useRef<string>('');
  // Whether we've already probed during the CURRENT visit to cvg. Reset every
  // time we leave cvg (e.g. to the SSO host), so returning from SSO re-probes.
  const probedVisitRef = useRef(false);

  /** True when a URL is on the cvg booking origin (scheme+host prefix). */
  const isBookingOrigin = (url: string) =>
    url.startsWith('https://cvg.jnu.ac.kr') || url.startsWith('http://cvg.jnu.ac.kr');

  /** Finalize login exactly once: persist auth, then enter the app. */
  const completeLogin = useCallback(
    (name?: string, id?: string) => {
      if (completedRef.current) return;
      completedRef.current = true;

      auth.login(name || undefined, id || undefined).then(() => {
        router.replace('/(tabs)/');
      });
    },
    [auth, router],
  );

  /**
   * Probe the current cvg page for real auth — but only once per visit.
   * Landing on cvg is NOT proof of login (its calendar is publicly viewable),
   * so AUTH_PROBE_SCRIPT reports whether we're authenticated (→ finish login)
   * and, if not, clicks the page's own login link to start the real SSO flow.
   */
  const maybeProbe = useCallback(() => {
    if (completedRef.current) return;
    if (!isBookingOrigin(currentUrlRef.current)) return;
    if (probedVisitRef.current) return;
    probedVisitRef.current = true;
    webViewRef.current?.injectJavaScript(AUTH_PROBE_SCRIPT);
  }, []);

  /** Called when the WebView navigates to a new URL. */
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url ?? '';
      currentUrlRef.current = url;

      // Whenever we're off cvg (e.g. the SSO host during the login round-trip),
      // arm a fresh probe so the return to cvg is re-checked. This fixes the
      // case where SSO sends us back to the SAME cvg URL we already probed —
      // previously that was suppressed and login silently never completed.
      if (!isBookingOrigin(url)) {
        probedVisitRef.current = false;
        return;
      }
      if (!navState.loading) maybeProbe();
    },
    [maybeProbe],
  );

  /** Handles postMessages sent from injected JS (AUTH_PROBE_SCRIPT). */
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'authState') {
          if (data.authed) {
            completeLogin(data.name, data.id);
          }
          // If not authenticated, the probe has already clicked the login
          // link; we wait for SSO to round-trip back to cvg and re-probe.
        }
      } catch {
        // Malformed message — ignore
      }
    },
    [completeLogin],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── Header / branding ── */}
      <View style={styles.header}>
        {/* Logo placeholder — replace with <Image> when asset is available */}
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>JNU</Text>
        </View>
        <Text style={styles.title}>
          {'전남대 AI융합대학\n스터디룸 예약'}
        </Text>
        <Text style={styles.subtitle}>JNU 포털 계정으로 로그인하세요</Text>
      </View>

      {/* ── WebView wrapper ── */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          // Start at the protected booking page (not the bare SSO login).
          // When unauthenticated, cvg itself redirects to SSO WITH the correct
          // return target, so after login the session lands back on cvg —
          // instead of the generic JNU portal.
          source={{ uri: URLS.BOOKING_CALENDAR }}
          style={styles.webView}
          // Cookie sharing
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          // JS + storage
          javaScriptEnabled
          domStorageEnabled
          // Disable the native loading bar — we draw our own
          // (on iOS the progress bar is controlled via renderLoading /
          //  startInLoadingState; on Android it's always hidden unless
          //  you use a custom component)
          startInLoadingState={false}
          // Events
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => {
            setIsLoading(false);
            // Backup to onNavigationStateChange: guarantees a probe once the
            // page has fully finished loading, even if the nav event's
            // loading=false transition was missed.
            maybeProbe();
          }}
          // Allow mixed content on Android (portal may load some http assets)
          mixedContentMode={Platform.OS === 'android' ? 'compatibility' : undefined}
        />

        {/* Custom loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>로딩 중...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  logoText: {
    fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightBold,
    color: Colors.primary,
  },
  title: {
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSizeSm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  // ── WebView ──
  webViewContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
  },

  // ── Loading overlay ──
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSizeMd,
    color: Colors.textSecondary,
  },
});
