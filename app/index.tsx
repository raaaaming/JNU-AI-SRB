import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

/**
 * Entry point — redirects to the correct screen based on auth state.
 * The root _layout.tsx also handles this, but having an explicit
 * redirect here avoids a blank frame on first load.
 */
export default function Index() {
  const { isLoggedIn, isLoading } = useAuth();

  // Don't redirect yet while loading
  if (isLoading) return null;

  if (isLoggedIn) {
    return <Redirect href="/(tabs)/" />;
  }
  return <Redirect href="/login" />;
}
