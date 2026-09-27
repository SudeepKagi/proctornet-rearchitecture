/**
 * @file AuthContext.jsx
 * @description React Context managing authentication state, in-memory tokens, and session refresh.
 * Enforces clean state resets on logout, unauthorizations, and role switches.
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/authApi.js';
import { setOnUnauthorized, clearAuthSession } from '../api/client.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore network/server failure on logout; local state must be cleared regardless
    } finally {
      setUser(null);
      clearAuthSession();
      // Cleanly reset router state so no previous route or role state leaks to the next session
      navigate('/login', { replace: true, state: null });
    }
  }, [navigate]);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      clearAuthSession();
      navigate('/login', { replace: true, state: null });
    });

    // Attempt silent session restoration using HttpOnly refresh cookie on application load
    async function initAuth() {
      try {
        const refreshData = await authApi.refresh();
        if (refreshData?.user && refreshData.user.verificationStatus) {
          setUser(refreshData.user);
        } else {
          // Fetch authoritative user profile with full verification status
          const me = await authApi.getMe();
          setUser(me);
        }
      } catch {
        setUser(null);
        clearAuthSession();
      } finally {
        setLoading(false);
      }
    }

    initAuth();
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      if (me) {
        setUser(me);
        return me;
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleLogin = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setUser(data.user);
    return data;
  }, []);

  const hasRole = useCallback(
    (roles) => {
      if (!user || !Array.isArray(user.roles)) return false;
      const allowed = Array.isArray(roles) ? roles : [roles];
      return user.roles.some((r) => allowed.includes(r));
    },
    [user]
  );

  const value = {
    user,
    setUser,
    refreshUser,
    loading,
    isAuthenticated: !!user,
    login: handleLogin,
    logout: handleLogout,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
