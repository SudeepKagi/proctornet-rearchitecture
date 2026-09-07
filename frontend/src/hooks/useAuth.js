/**
 * @file useAuth.js
 * @description Hook exposing authentication context state and methods.
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
