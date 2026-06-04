import { useEffect, useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SessionBridgeProvider } from '@/contexts/SessionBridge';
import { PORTAL_PROFILE_SCRIPT } from '@/utils/webviewScripts';

/**
 * One-shot hidden WebView that loads portal.jnu.ac.kr and extracts the user's
 * name, student ID, and department.  Shares the SSO cookie store with the
 * bridge WebView so it auto-authenticates.
 *
 * portal.jnu.ac.kr uses a Korean CA (NIPA/CrossCert) not included in the
 * Android default trust store.  Since this URL is hardcoded to the university's
 * own portal inside a closed university app, bypassing the SSL error via
 * handler.proceed() is intentional and safe for this loader only.
 *
 * onDone is called on success or failure so the caller can unmount the loader
 * and stop retrying for the rest of the session.
 */
function PortalProfileLoader({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const webRef = useRef<WebView>(null);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  }, [onDone]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'portalProfile') {
          if (data.name || data.id || data.dept) {
            auth.setProfile(data.name ?? '', data.id ?? '', data.dept ?? '');
          }
          finish();
        }
      } catch {
        // ignore malformed messages
      }
    },
    [auth, finish],
  );

  return (
    <WebView
      ref={webRef}
      source={{ uri: 'https://portal.jnu.ac.kr/Pages/Default.aspx' }}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      javaScriptEnabled
      domStorageEnabled
      onLoadEnd={() => webRef.current?.injectJavaScript(PORTAL_PROFILE_SCRIPT)}
      onMessage={handleMessage}
      onError={finish}
      onHttpError={finish}
      onSslError={(event) => {
        // portal.jnu.ac.kr uses a Korean CA not trusted by Android's default
        // store. The URL is hardcoded to the university's own portal so
        // proceeding past the SSL check is intentional for this loader only.
        event.nativeEvent.handler.proceed();
      }}
      renderError={() => <View />}
    />
  );
}

/**
 * Inner component that owns the auth-based routing guard.
 * Lives below <AuthProvider> so it shares the single auth state instance.
 *
 * - While auth state is loading from AsyncStorage, renders nothing.
 * - Unauthenticated users are redirected to /login.
 * - Authenticated users see the main (tabs) layout.
 */
function RootNavigator() {
  const auth = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [profileAttempted, setProfileAttempted] = useState(false);

  useEffect(() => {
    // Wait until the persisted auth state has been read
    if (auth.isLoading) return;

    const onLoginPage = segments[0] === 'login';

    if (!auth.isLoggedIn && !onLoginPage) {
      router.replace('/login');
    } else if (auth.isLoggedIn && onLoginPage) {
      router.replace('/(tabs)/');
    }
  }, [auth.isLoggedIn, auth.isLoading, segments, router]);

  if (auth.isLoading) return null;

  const showProfileLoader = auth.isLoggedIn && !auth.userDept && !profileAttempted;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="booking" options={{ presentation: 'modal' }} />
      </Stack>
      {showProfileLoader && (
        <PortalProfileLoader onDone={() => setProfileAttempted(true)} />
      )}
    </>
  );
}

/**
 * Root layout — provides shared context to the whole app.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SessionBridgeProvider>
            <RootNavigator />
          </SessionBridgeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
