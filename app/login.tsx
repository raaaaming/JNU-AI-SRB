import { useRef, useState, useCallback, useEffect } from 'react';
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
import { EXTRACT_USER_SCRIPT } from '@/utils/webviewScripts';

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
  // Ensures we navigate into the app exactly once, no matter how many
  // times the success URL fires or whether user-info arrives first.
  const completedRef = useRef(false);
  // Tracks the fallback timer so it can be cancelled if user-info arrives.
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Finalize login exactly once: persist auth, then enter the app. */
  const completeLogin = useCallback(
    (name?: string, id?: string) => {
      if (completedRef.current) return;
      completedRef.current = true;

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      auth.login(name || undefined, id || undefined).then(() => {
        router.replace('/(tabs)/');
      });
    },
    [auth, router],
  );

  /** Called when the SSO WebView navigates to a new URL. */
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url ?? '';

      // Once the page lands on the booking domain → login succeeded
      if (url.includes('cvg.jnu.ac.kr') && !completedRef.current) {
        // Try to scrape user info from the page before we navigate away
        webViewRef.current?.injectJavaScript(EXTRACT_USER_SCRIPT);

        // If userInfo postMessage doesn't arrive within 1.5 s,
        // proceed without it so the user isn't left waiting.
        if (!fallbackTimerRef.current) {
          fallbackTimerRef.current = setTimeout(() => completeLogin(), 1500);
        }
      }
    },
    [completeLogin],
  );

  /** Handles postMessages sent from injected JS (e.g. EXTRACT_USER_SCRIPT). */
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'userInfo') {
          const { name, id } = data as { type: 'userInfo'; name: string; id: string };
          completeLogin(name, id);
        }
      } catch {
        // Malformed message — ignore
      }
    },
    [completeLogin],
  );

  // Clean up the fallback timer if the screen unmounts mid-login
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

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
          source={{ uri: URLS.SSO_LOGIN }}
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
          onLoadEnd={() => setIsLoading(false)}
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
