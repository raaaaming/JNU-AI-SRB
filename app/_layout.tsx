import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

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

  useEffect(() => {
    // Wait until the persisted auth state has been read
    if (auth.isLoading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const onLoginPage = segments[0] === 'login';

    if (!auth.isLoggedIn && !onLoginPage) {
      // Not logged in → go to login
      router.replace('/login');
    } else if (auth.isLoggedIn && !inAuthGroup) {
      // Already logged in → go to main app
      router.replace('/(tabs)/');
    }
  }, [auth.isLoggedIn, auth.isLoading, segments, router]);

  // Render nothing while loading to avoid a flash of the wrong screen
  if (auth.isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
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
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
