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
import {
  AUTH_PROBE_SCRIPT,
  SSO_STEP_PROBE,
  OTP_TIMER_SCRIPT,
  OTP_REQUEST_SMS_SCRIPT,
  OTP_CANCEL_SCRIPT,
  buildFillCredentialsScript,
  buildFillOtpScript,
} from '@/utils/webviewScripts';

const SAVED_ID_KEY = 'last_user_id';
const OTP_LENGTH = 6;

/**
 * Login screen — hybrid native + WebView.
 *
 * The SSO session lives in a hidden WebView (so its cookies stay available to
 * the SessionBridge), but both SSO steps are driven from NATIVE UI:
 *   - credentials: native ID/pw form → injected into the SSO "아이디" tab
 *   - otp:         native 6-digit code + "신뢰기기 등록" → injected into the
 *                  #otpDigitGroup boxes (the page auto-verifies on completion)
 *
 * The only part still shown in the WebView is the SMS/email delivery modal
 * (its markup isn't mirrored natively yet).
 *
 * Phases:
 *   init        — loading cvg / redirecting / verifying (spinner)
 *   credentials — native ID/pw form
 *   otp         — native 2-step code entry
 *   webview     — official page shown directly (fallback)
 *
 * If a trusted-device cookie is still valid, cvg loads authenticated and the
 * probe finishes login immediately — no form is shown.
 */
type Phase = 'init' | 'credentials' | 'otp' | 'webview';

export default function LoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  const [phase, setPhase] = useState<Phase>('init');

  // Credentials step
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [saveId, setSaveId] = useState(true);

  // OTP step
  const [otpCode, setOtpCode] = useState('');
  const [otpTrust, setOtpTrust] = useState(true);
  const [otpTimer, setOtpTimer] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  // Reveal the WebView so the user can use the official SMS/email delivery modal.
  const [showDelivery, setShowDelivery] = useState(false);

  // Navigate into the app exactly once.
  const completedRef = useRef(false);
  // The user has submitted the native credentials.
  const submittedRef = useRef(false);
  // Latest URL the WebView is on.
  const currentUrlRef = useRef<string>('');
  // Whether we've already probed during the CURRENT visit to cvg.
  const probedVisitRef = useRef(false);

  const isBookingOrigin = (url: string) =>
    url.startsWith('https://cvg.jnu.ac.kr') || url.startsWith('http://cvg.jnu.ac.kr');
  const isSsoHost = (url: string) => url.includes('sso.jnu.ac.kr');

  // Prefill the saved ID, if any.
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ID_KEY)
      .then((id) => id && setUserIdInput(id))
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

  /** Probe a cvg page for real auth — once per visit (see AUTH_PROBE_SCRIPT). */
  const maybeProbe = useCallback(() => {
    if (completedRef.current) return;
    if (!isBookingOrigin(currentUrlRef.current)) return;
    if (probedVisitRef.current) return;
    probedVisitRef.current = true;
    webViewRef.current?.injectJavaScript(AUTH_PROBE_SCRIPT);
  }, []);

  /** On an SSO page, ask which step is showing so the native UI can mirror it. */
  const probeSsoStep = useCallback(() => {
    if (completedRef.current) return;
    webViewRef.current?.injectJavaScript(SSO_STEP_PROBE);
  }, []);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url ?? '';
      currentUrlRef.current = url;

      if (isBookingOrigin(url)) {
        if (!completedRef.current) setPhase('init');
        if (!navState.loading) maybeProbe();
        return;
      }

      // Off cvg → re-arm the cvg probe for our eventual return.
      probedVisitRef.current = false;

      if (isSsoHost(url)) {
        // Ask the page which SSO step it's on (credentials vs otp).
        if (!navState.loading) probeSsoStep();
        else if (phase === 'init' && !submittedRef.current) {
          // keep spinner until the probe resolves
        }
      } else if (submittedRef.current && !navState.loading) {
        // Left the SSO host after submitting → auth succeeded (cookie is set
        // even if SSO routed us to the portal). Finish login.
        completeLogin();
      }
    },
    [maybeProbe, probeSsoStep, completeLogin, phase],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case 'authState':
            if (data.authed) completeLogin(data.name, data.id);
            else if (data.noControls) {
              webViewRef.current?.injectJavaScript(
                `window.location.href = ${JSON.stringify(URLS.SSO_LOGIN_RETURN)}; true;`,
              );
            }
            break;

          case 'ssoStep':
            if (data.step === 'otp') {
              setShowDelivery(false);
              setOtpVerifying(false);
              if (data.timer) setOtpTimer(data.timer);
              setPhase('otp');
            } else if (data.step === 'credentials') {
              // Back on the credentials page. If we'd already submitted, the
              // login was rejected — surface the error and let the user retry.
              if (submittedRef.current) {
                submittedRef.current = false;
                Alert.alert('로그인 실패', data.error || '아이디 또는 비밀번호를 확인해주세요.');
              }
              setPhase('credentials');
            } else if (submittedRef.current) {
              setPhase('webview');
            }
            break;

          case 'otpTimer':
            if (data.value) setOtpTimer(data.value);
            break;

          case 'otpResult':
            if (!data.ok) {
              setOtpVerifying(false);
              Alert.alert('인증 오류', data.error || '인증번호 확인에 실패했습니다.');
            }
            // On ok we keep the spinner; the page auto-verifies and redirects,
            // which completeLogin() picks up via navigation.
            break;

          case 'credError':
            submittedRef.current = false;
            setPhase('credentials');
            Alert.alert('로그인 오류', '아이디/비밀번호 입력란을 찾지 못했습니다. 다시 시도해주세요.');
            break;
        }
      } catch {
        // ignore malformed messages
      }
    },
    [completeLogin],
  );

  // While on the native OTP screen, keep the countdown fresh.
  useEffect(() => {
    if (phase !== 'otp' || showDelivery) return;
    const id = setInterval(() => webViewRef.current?.injectJavaScript(OTP_TIMER_SCRIPT), 1000);
    return () => clearInterval(id);
  }, [phase, showDelivery]);

  // ── Actions ──
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
    setPasswordInput('');
    setPhase('init'); // spinner until the OTP step is detected
    // The credentials submit may be AJAX (no full load); poll for the next step.
    setTimeout(probeSsoStep, 1200);
    setTimeout(probeSsoStep, 2600);
  }, [userIdInput, passwordInput, saveId, probeSsoStep]);

  const requestSmsCode = useCallback(() => {
    webViewRef.current?.injectJavaScript(OTP_REQUEST_SMS_SCRIPT);
    // The delivery picker is a page modal we don't mirror yet — reveal it.
    setShowDelivery(true);
  }, []);

  const submitOtp = useCallback(() => {
    const code = otpCode.replace(/[^0-9]/g, '');
    if (code.length < OTP_LENGTH) {
      Alert.alert('입력 확인', `인증번호 ${OTP_LENGTH}자리를 입력해주세요.`);
      return;
    }
    setOtpVerifying(true);
    webViewRef.current?.injectJavaScript(buildFillOtpScript(code, otpTrust));
  }, [otpCode, otpTrust]);

  const cancelOtp = useCallback(() => {
    submittedRef.current = false;
    setOtpCode('');
    setOtpVerifying(false);
    setPhase('init');
    webViewRef.current?.injectJavaScript(OTP_CANCEL_SCRIPT);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>JNU</Text>
        </View>
        <Text style={styles.title}>{'전남대 AI융합대학\n스터디룸 예약'}</Text>
        <Text style={styles.subtitle}>JNU 포털 계정으로 로그인하세요</Text>
      </View>

      <View style={styles.body}>
        <WebView
          ref={webViewRef}
          source={{ uri: URLS.BOOKING_CALENDAR }}
          style={styles.webView}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadEnd={() => {
            const url = currentUrlRef.current;
            if (isBookingOrigin(url)) maybeProbe();
            else if (isSsoHost(url)) probeSsoStep();
          }}
          mixedContentMode={Platform.OS === 'android' ? 'compatibility' : undefined}
        />

        {/* Delivery-modal banner while the WebView is revealed for it */}
        {phase === 'otp' && showDelivery && (
          <View style={styles.deliveryBar}>
            <TouchableOpacity onPress={() => setShowDelivery(false)} style={styles.deliveryBack}>
              <Ionicons name="arrow-back" size={20} color={Colors.primary} />
              <Text style={styles.deliveryBackText}>인증번호 입력으로</Text>
            </TouchableOpacity>
            <Text style={styles.deliveryHint}>발송 방법을 선택하세요</Text>
          </View>
        )}

        {/* ── Native credentials form ── */}
        {phase === 'credentials' && (
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.formTitle}>아이디 로그인</Text>
              <Text style={styles.formHint}>
                아이디·비밀번호로 로그인하면 다음 단계에서 인증번호를 입력합니다.
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

              <TouchableOpacity style={styles.checkRow} onPress={() => setSaveId((v) => !v)} activeOpacity={0.7}>
                <Ionicons name={saveId ? 'checkbox' : 'square-outline'} size={20} color={saveId ? Colors.primary : Colors.textDisabled} />
                <Text style={styles.checkText}>아이디 저장</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryBtn} onPress={submitCredentials} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>로그인</Text>
              </TouchableOpacity>

              <Text style={styles.note}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.textDisabled} /> 비밀번호는 학교
                공식 SSO에만 전송되며 앱에 저장되지 않습니다.
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── Native OTP form ── */}
        {phase === 'otp' && !showDelivery && (
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.formTitle}>2단계 인증번호 입력</Text>
              <Text style={styles.formHint}>
                문자·이메일로 받은 인증번호 {OTP_LENGTH}자리를 입력하세요.
              </Text>

              {otpTimer ? (
                <View style={styles.timerRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.warning} />
                  <Text style={styles.timerText}>인증 유효시간 {otpTimer}</Text>
                </View>
              ) : null}

              <TextInput
                style={styles.otpInput}
                placeholder="------"
                placeholderTextColor={Colors.textDisabled}
                value={otpCode}
                onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                returnKeyType="go"
                onSubmitEditing={submitOtp}
                autoFocus
              />

              <TouchableOpacity style={styles.checkRow} onPress={() => setOtpTrust((v) => !v)} activeOpacity={0.7}>
                <Ionicons name={otpTrust ? 'checkbox' : 'square-outline'} size={20} color={otpTrust ? Colors.primary : Colors.textDisabled} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkText}>신뢰할 수 있는 기기 등록</Text>
                  <Text style={styles.checkSub}>체크하면 약 1개월간 추가 인증 없이 자동 로그인됩니다.</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, otpVerifying && styles.btnDisabled]}
                onPress={submitOtp}
                disabled={otpVerifying}
                activeOpacity={0.85}
              >
                {otpVerifying ? (
                  <ActivityIndicator color={Colors.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>인증하기</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={requestSmsCode} activeOpacity={0.8}>
                <Ionicons name="mail-outline" size={18} color={Colors.primary} />
                <Text style={styles.secondaryBtnText}>문자·이메일로 인증번호 받기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={cancelOtp} activeOpacity={0.7}>
                <Text style={styles.cancelText}>인증 취소</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* Spinner */}
        {phase === 'init' && (
          <View style={styles.overlay}>
            <View style={styles.spinnerCenter}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.spinnerText}>{submittedRef.current ? '인증 단계 준비 중…' : '로그인 준비 중…'}</Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },

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

  body: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  webView: { flex: 1 },

  // Delivery-modal bar
  deliveryBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#EAF1FB',
  },
  deliveryBack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deliveryBackText: { fontSize: Typography.fontSizeSm, color: Colors.primary, fontWeight: Typography.fontWeightSemibold },
  deliveryHint: { fontSize: Typography.fontSizeXs, color: Colors.textSecondary },

  // Shared overlay (covers WebView)
  overlay: {
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
  formHint: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.lg },

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
  input: { flex: 1, paddingVertical: Spacing.md, fontSize: Typography.fontSizeMd, color: Colors.textPrimary },

  // OTP code field
  otpInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    fontSize: 30,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: Spacing.md,
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  timerText: { fontSize: Typography.fontSizeSm, color: Colors.warning, fontWeight: Typography.fontWeightSemibold },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.lg },
  checkText: { fontSize: Typography.fontSizeMd, color: Colors.textPrimary },
  checkSub: { fontSize: Typography.fontSizeXs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    ...Shadow.sm,
  },
  primaryBtnText: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textOnPrimary },
  btnDisabled: { opacity: 0.6 },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  secondaryBtnText: { fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold, color: Colors.primary },

  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.sm },
  cancelText: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary },

  note: { marginTop: Spacing.lg, fontSize: Typography.fontSizeXs, color: Colors.textDisabled, lineHeight: 17, textAlign: 'center' },

  spinnerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  spinnerText: { fontSize: Typography.fontSizeMd, color: Colors.textSecondary },
});
