import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import authApi from '../services/authApi.js';

export const AuthContext = createContext(null);

/**
 * Session state for the whole app. The JWT lives in an HTTP-only cookie, so
 * "am I signed in?" is answered by asking the API, not by reading storage.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [googleEnabled, setGoogleEnabled] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const current = await authApi.fetchCurrentUser();
      setUser(current);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
    authApi
      .fetchAuthConfig()
      .then((config) => setGoogleEnabled(config.googleOAuthEnabled))
      .catch(() => setGoogleEnabled(true));
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      googleEnabled,
      signIn: authApi.startGoogleLogin,
      signOut,
      refresh,
    }),
    [user, status, googleEnabled, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
