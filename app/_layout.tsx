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
 * onDone is called whether the load succeeded or failed so the caller can
 * unmount this component and stop retrying for the session.
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
  // Tracks whether we have already attempted the portal profile fetch this
  // session (success or failure). Resets on every app launch; persisted
  // userDept from AsyncStorage means we won't mount the loader at all on
  // subsequent opens after a successful fetch.
  const [profileAttempted, setProfileAttempted] = useState(false);

  useEffect(() => {
    // Wait until the persisted auth state has been read
    if (auth.isLoading) return;

    const onLoginPage = segments[0] === 'login';

    if (!auth.isLoggedIn && !onLoginPage) {
      // Not logged in → go to login
      router.replace('/login');
    } else if (auth.isLoggedIn && onLoginPage) {
      // Logged in but still on the login page → enter the app.
      // (Other authed routes like /booking are left alone.)
      router.replace('/(tabs)/');
    }
  }, [auth.isLoggedIn, auth.isLoading, segments, router]);

  // Render nothing while loading to avoid a flash of the wrong screen
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
