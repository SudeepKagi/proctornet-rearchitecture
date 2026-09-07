/**
 * @file AuthContext.jsx
 * @description React Context managing authentication state, in-memory tokens, and session refresh.
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import * as authApi from '../api/authApi.js';
import { setOnUnauthorized, setAccessToken } from '../api/client.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout failure, clear local state regardless
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
    });

    // Attempt silent session restoration using HttpOnly refresh cookie on application load
    async function initAuth() {
      try {
        const refreshData = await authApi.refresh();
        if (refreshData?.user) {
          setUser(refreshData.user);
        } else {
          // If refresh only gave token, fetch user profile
          const me = await authApi.getMe();
          setUser(me);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    initAuth();
  }, []);

  const handleLogin = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setUser(data.user);
    return data;
  }, []);

  const handleRegister = useCallback(async (userData) => {
    return await authApi.register(userData);
  }, []);

  const hasRole = useCallback((roles) => {
    if (!user || !user.roles) return false;
    const allowed = Array.isArray(roles) ? roles : [roles];
    return user.roles.some((r) => allowed.includes(r));
  }, [user]);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
