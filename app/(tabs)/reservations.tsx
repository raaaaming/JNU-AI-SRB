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
import { buildMyReservationsUrl } from '@/constants/urls';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { CLEANUP_SCRIPT } from '@/utils/webviewScripts';

/** A month encoded as a single index: year * 12 + (month - 1). */
function todayMonthIndex(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

/** Korean month label, e.g. "2026년 6월" */
function formatMonthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

/**
 * 내 예약 (My Reservations) tab.
 *
 * Displays the user's reservations for the selected month.
 * Month navigation arrows let the user browse past/future months.
 * The WebView key changes whenever the month changes, forcing a reload.
 */
export default function ReservationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  // A single month index keeps year/month rollover atomic and bug-free.
  const [monthIndex, setMonthIndex] = useState(todayMonthIndex);
  const [isLoading, setIsLoading] = useState(true);

  const currentYear = Math.floor(monthIndex / 12);
  const currentMonth = (monthIndex % 12) + 1;

  const reservationsUrl = buildMyReservationsUrl(currentYear, currentMonth);
  // Unique key forces WebView to remount (and thus reload) on month change
  const webViewKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // ── Month navigation ──

  const goToPrevMonth = useCallback(() => setMonthIndex((i) => i - 1), []);
  const goToNextMonth = useCallback(() => setMonthIndex((i) => i + 1), []);

  // ── Session expiry detection ──

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url ?? '';
      if (url.includes('sso.jnu.ac.kr')) {
        auth.logout().then(() => {
          router.replace('/login');
        });
      }
    },
    [auth, router],
  );

  const handleMessage = useCallback((_event: WebViewMessageEvent) => {
    // Reserved for future postMessage handling
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 예약 현황</Text>
      </View>

      {/* ── Month navigation bar ── */}
      <View style={styles.monthBar}>
        <TouchableOpacity
          style={styles.arrowButton}
          onPress={goToPrevMonth}
          accessibilityLabel="이전 달"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>

        <Text style={styles.monthLabel}>
          {formatMonthLabel(currentYear, currentMonth)}
        </Text>

        <TouchableOpacity
          style={styles.arrowButton}
          onPress={goToNextMonth}
          accessibilityLabel="다음 달"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-forward-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ── WebView ── */}
      <View style={styles.webViewContainer}>
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ uri: reservationsUrl }}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
  },
  headerTitle: {
    fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
  },

  // ── Month navigation ──
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  arrowButton: {
    padding: Spacing.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
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
