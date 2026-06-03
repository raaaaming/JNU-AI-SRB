import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebView, {
  type WebViewNavigation,
  type WebViewMessageEvent,
} from 'react-native-webview';

import { useAuth } from '@/hooks/useAuth';
import { URLS } from '@/constants/urls';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { AUTH_PROBE_SCRIPT, buildFillCredentialsScript } from '@/utils/webviewScripts';

const SAVED_ID_KEY = 'last_user_id';

/**
 * Login screen — hybrid native + WebView.
 *
 * The actual SSO session lives in a hidden WebView (so its cookies stay
 * available to the SessionBridge). The first step — ID + password — is a
 * NATIVE form whose values are injected into the WebView's SSO "아이디" tab and
 * submitted. The second step (SMS/email/OTP code + "신뢰할 수 있는 기기등록")
 * is shown in the WebView itself, since it's dynamic and security-sensitive.
 *
 * Flow / phases:
 *   init        — WebView loading cvg / redirecting to SSO (spinner)
 *   credentials — on the SSO login page: native ID/pw form is shown
 *   webview     — after submitting: the official OTP / trusted-device page
 *
 * If a trusted-device cookie is still valid, cvg loads authenticated and the
 * probe finishes login immediately — the native form is never shown.
 */
type Phase = 'init' | 'credentials' | 'webview';

export default function LoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  const [phase, setPhase] = useState<Phase>('init');
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [saveId, setSaveId] = useState(true);

  // Navigate into the app exactly once.
  const completedRef = useRef(false);
  // The user has submitted the native credentials → reveal the WebView for OTP.
  const submittedRef = useRef(false);
  // Latest URL the WebView is on.
  const currentUrlRef = useRef<string>('');
  // Whether we've already probed during the CURRENT visit to cvg.
  const probedVisitRef = useRef(false);

  /** True when a URL is on the cvg booking origin (scheme+host prefix). */
  const isBookingOrigin = (url: string) =>
    url.startsWith('https://cvg.jnu.ac.kr') || url.startsWith('http://cvg.jnu.ac.kr');

  /** True when a URL is on the SSO host. */
  const isSsoHost = (url: string) => url.includes('sso.jnu.ac.kr');

  // Prefill the saved ID, if any.
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ID_KEY)
      .then((id) => {
        if (id) setUserIdInput(id);
      })
      .catch(() => {});
  }, []);

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
   * Probe the current cvg page for real auth — once per visit. Landing on cvg
   * is NOT proof of login (the calendar is public), so AUTH_PROBE_SCRIPT reports
   * whether we're authenticated (→ finish) and, if not, clicks the page's own
   * login link to start the real SSO flow.
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

      if (isBookingOrigin(url)) {
        // On cvg: either heading to login (probe clicks 로그인) or returning
        // post-auth (probe finishes). Show a spinner while that resolves.
        if (!completedRef.current) setPhase('init');
        if (!navState.loading) maybeProbe();
        return;
      }

      // Off cvg → arm a fresh probe for when we come back (fixes the case where
      // SSO returns to the same cvg URL we already probed).
      probedVisitRef.current = false;

      if (isSsoHost(url)) {
        // Credentials page before submit → native form; after submit → the
        // official OTP / trusted-device page in the WebView.
        setPhase(submittedRef.current ? 'webview' : 'credentials');
      } else if (submittedRef.current) {
        setPhase('webview');
      }
    },
    [maybeProbe],
  );

  /** Handles postMessages from injected JS (probe + credential fill). */
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'authState') {
          if (data.authed) completeLogin(data.name, data.id);
          return;
        }
        if (data.type === 'credError') {
          submittedRef.current = false;
          setPhase('credentials');
          Alert.alert('로그인 오류', '아이디/비밀번호 입력란을 찾지 못했습니다. 다시 시도해주세요.');
        }
      } catch {
        // Malformed message — ignore
      }
    },
    [completeLogin],
  );

  /** Inject the native credentials into the SSO form and submit. */
  const submitCredentials = useCallback(() => {
    const id = userIdInput.trim();
    if (!id || !passwordInput) {
      Alert.alert('입력 확인', '아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    if (saveId) AsyncStorage.setItem(SAVED_ID_KEY, id).catch(() => {});
    else AsyncStorage.removeItem(SAVED_ID_KEY).catch(() => {});

    submittedRef.current = true;
    webViewRef.current?.injectJavaScript(buildFillCredentialsScript(id, passwordInput));
    // Don't keep the password around in memory.
    setPasswordInput('');
    // Reveal the WebView for the OTP / trusted-device step.
    setPhase('webview');
  }, [userIdInput, passwordInput, saveId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── Header / branding ── */}
      <View style={styles.header}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>JNU</Text>
        </View>
        <Text style={styles.title}>{'전남대 AI융합대학\n스터디룸 예약'}</Text>
        <Text style={styles.subtitle}>JNU 포털 계정으로 로그인하세요</Text>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>
        {/* The SSO WebView is always mounted; it's covered by the native form
            during the credentials phase and revealed for the OTP step. */}
        <WebView
          ref={webViewRef}
          // Start at the protected booking page so cvg redirects to SSO WITH
          // the correct return target (lands back on cvg, not the portal).
          source={{ uri: URLS.BOOKING_CALENDAR }}
          style={styles.webView}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          mixedContentMode={Platform.OS === 'android' ? 'compatibility' : undefined}
        />

        {/* OTP-step helper banner (only while the official page is shown) */}
        {phase === 'webview' && (
          <View style={styles.otpBanner} pointerEvents="none">
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
            <Text style={styles.otpBannerText}>
              인증번호를 입력하고 <Text style={styles.otpBannerBold}>'신뢰할 수 있는 기기등록'</Text>을 체크하면
              1개월간 자동 로그인됩니다.
            </Text>
          </View>
        )}

        {/* Native credentials form (covers the WebView) */}
        {phase === 'credentials' && (
          <KeyboardAvoidingView
            style={styles.formOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={styles.formScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.formTitle}>아이디 로그인</Text>
              <Text style={styles.formHint}>
                아이디·비밀번호로 로그인하면 다음 화면에서 문자/이메일/OTP 인증을 진행합니다.
              </Text>

              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="전남대학교 ID"
                  placeholderTextColor={Colors.textDisabled}
                  value={userIdInput}
                  onChangeText={setUserIdInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="비밀번호"
                  placeholderTextColor={Colors.textDisabled}
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={submitCredentials}
                />
              </View>

              <TouchableOpacity
                style={styles.saveIdRow}
                onPress={() => setSaveId((v) => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={saveId ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={saveId ? Colors.primary : Colors.textDisabled}
                />
                <Text style={styles.saveIdText}>아이디 저장</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.loginBtn} onPress={submitCredentials} activeOpacity={0.85}>
                <Text style={styles.loginBtnText}>로그인</Text>
              </TouchableOpacity>

              <Text style={styles.secureNote}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.textDisabled} /> 비밀번호는 학교
                공식 SSO에만 전송되며 앱에 저장되지 않습니다.
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* Initial / transition spinner */}
        {phase === 'init' && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>로그인 준비 중…</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },

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
  logoText: { fontSize: Typography.fontSizeXl, fontWeight: Typography.fontWeightBold, color: Colors.primary },
  title: {
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: Spacing.xs,
  },
  subtitle: { fontSize: Typography.fontSizeSm, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

  // ── Body ──
  body: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  webView: { flex: 1 },

  // ── OTP helper banner ──
  otpBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#EAF1FB',
  },
  otpBannerText: { flex: 1, fontSize: Typography.fontSizeXs, color: Colors.textSecondary, lineHeight: 16 },
  otpBannerBold: { fontWeight: Typography.fontWeightBold, color: Colors.primary },

  // ── Native credentials form ──
  formOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
  },
  formScroll: { padding: Spacing.lg, paddingTop: Spacing.xl },
  formTitle: {
    fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  formHint: {
    fontSize: Typography.fontSizeSm,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  inputIcon: { marginRight: Spacing.sm },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSizeMd,
    color: Colors.textPrimary,
  },
  saveIdRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.lg },
  saveIdText: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    ...Shadow.sm,
  },
  loginBtnText: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textOnPrimary },
  secureNote: {
    marginTop: Spacing.lg,
    fontSize: Typography.fontSizeXs,
    color: Colors.textDisabled,
    lineHeight: 17,
    textAlign: 'center',
  },

  // ── Loading overlay ──
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: { marginTop: Spacing.sm, fontSize: Typography.fontSizeMd, color: Colors.textSecondary },
});
