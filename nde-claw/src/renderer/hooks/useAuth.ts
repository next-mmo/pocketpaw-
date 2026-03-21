// --------------------------------------------------------------------------
// useAuth — React hook that drives the authentication lifecycle
//
// Mount this in the root layout component.  It:
// 1. Triggers authenticate() on mount
// 2. Returns auth state for conditional rendering
// 3. Provides retry() for error recovery
// --------------------------------------------------------------------------

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

/** Boot the auth flow on mount. Call once in the root layout. */
export function useAuth() {
  const authState = useAuthStore((s) => s.authState);
  const authError = useAuthStore((s) => s.authError);
  const wsState = useAuthStore((s) => s.wsState);
  const authenticate = useAuthStore((s) => s.authenticate);
  const retry = useAuthStore((s) => s.retry);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (authState === 'idle') {
      void authenticate();
    }
  }, [authState, authenticate]);

  return {
    authState,
    authError,
    wsState,
    isAuthenticated: authState === 'authenticated',
    isLoading: authState === 'checking_backend' || authState === 'authenticating',
    isError: authState === 'error',
    retry,
    logout,
  };
}
