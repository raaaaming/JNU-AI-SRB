import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '@/hooks/useAuth';
import { PORTAL_PROFILE_SCRIPT } from '@/utils/webviewScripts';
import LoginScreen from '@/screens/LoginScreen';
import TabNavigator from '@/navigation/TabNavigator';
import BookingScreen from '@/screens/BookingScreen';

const Stack = createNativeStackNavigator();

/**
 * One-shot hidden WebView that loads portal.jnu.ac.kr and extracts the user's
 * name, student ID, and department. Shares the SSO cookie store with the
 * bridge WebView so it auto-authenticates.
 *
 * portal.jnu.ac.kr uses a Korean CA (NIPA/CrossCert) not included in the
 * Android default trust store. Since this URL is hardcoded to the university's
 * own portal inside a closed university app, bypassing the SSL error via
 * handler.proceed() is intentional and safe for this loader only.
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error onSslError is an Android-only prop not yet in the TS types
      onSslError={(event: any) => {
        // portal.jnu.ac.kr uses a Korean CA not trusted by Android's default
        // store. The URL is hardcoded to the university's own portal so
        // proceeding past the SSL check is intentional for this loader only.
        event.nativeEvent.handler.proceed();
      }}
      renderError={() => <View />}
    />
  );
}

function AppNavigator() {
  const auth = useAuth();
  const [profileAttempted, setProfileAttempted] = useState(false);

  if (auth.isLoading) return null;

  const showProfileLoader = auth.isLoggedIn && !auth.userDept && !profileAttempted;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {auth.isLoggedIn ? (
          <>
            <Stack.Screen name="MainTabs" component={TabNavigator} />
            <Stack.Screen
              name="Booking"
              component={BookingScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
      {showProfileLoader && (
        <PortalProfileLoader onDone={() => setProfileAttempted(true)} />
      )}
    </View>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}
