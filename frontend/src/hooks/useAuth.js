/**
 * @file useAuth.js
 * @description Hook exposing authentication context state and methods.
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      loading: false,
      isAuthenticated: false,
      login: async () => {},
      register: async () => {},
      logout: async () => {},
      hasRole: () => false,
    };
  }
  return context;
}
