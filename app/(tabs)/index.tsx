import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/useAuth';
import { URLS } from '@/constants/urls';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { CLEANUP_SCRIPT } from '@/utils/webviewScripts';

/**
 * 예약하기 (Booking Calendar) tab.
 *
 * Renders the JNU facility booking calendar inside a WebView with
 * university chrome stripped out.  Session expiry is detected via
 * a redirect back to the SSO domain.
 */
export default function BookingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);

  /** Refresh the WebView — simulates pull-to-refresh for WebView. */
  const handleRefresh = useCallback(() => {
    webViewRef.current?.reload();
  }, []);

  /** Detect session expiry: SSO domain means the server redirected us back to login. */
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url ?? '';
      if (url.includes('sso.jnu.ac.kr')) {
        // Session expired — log out and return to login screen
        auth.logout().then(() => {
          router.replace('/login');
        });
      }
    },
    [auth, router],
  );

  const handleMessage = useCallback((_event: WebViewMessageEvent) => {
    // Reserved for future postMessage handling from injected scripts
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>스터디룸 예약</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          accessibilityLabel="새로고침"
          accessibilityRole="button"
        >
          <Ionicons name="refresh-outline" size={22} color={Colors.textOnPrimary} />
          <Text style={styles.refreshLabel}>새로고침</Text>
        </TouchableOpacity>
      </View>

      {/* ── Native booking CTA ── */}
      <TouchableOpacity
        style={styles.bookingCta}
        onPress={() => router.push('/booking')}
        accessibilityRole="button"
        accessibilityLabel="예약 신청하기"
      >
        <Ionicons name="add-circle" size={20} color={Colors.textOnPrimary} />
        <Text style={styles.bookingCtaText}>예약 신청하기</Text>
      </TouchableOpacity>

      {/* ── WebView ── */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: URLS.BOOKING_CALENDAR }}
          style={styles.webView}
          // Cookie sharing
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          // JS + storage
          javaScriptEnabled
          domStorageEnabled
          // Strip portal chrome
          injectedJavaScript={CLEANUP_SCRIPT}
          // Events
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          // Mixed content for Android
          mixedContentMode={Platform.OS === 'android' ? 'compatibility' : undefined}
        />

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
  },
  headerTitle: {
    fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  refreshLabel: {
    fontSize: Typography.fontSizeSm,
    color: Colors.textOnPrimary,
  },

  // ── Booking CTA ──
  bookingCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.md,
  },
  bookingCtaText: {
    fontSize: Typography.fontSizeMd,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textOnPrimary,
  },

  // ── WebView ──
  webViewContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
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
  },
  loadingText: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSizeMd,
    color: Colors.textSecondary,
  },
});
