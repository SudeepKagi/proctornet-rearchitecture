import { useState, useEffect } from 'react';

/**
 * Hook for managing layout preferences.
 * ProctorNet is standardized strictly on the clean academic Light Theme.
 * Density controls (compact, comfortable, touch) remain supported.
 */
export function useTheme() {
  const [density, setDensity] = useState('comfortable');

  useEffect(() => {
    try {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } catch {
      // localStorage security restriction fallback
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  return {
    theme: 'light',
    isDark: false,
    toggleTheme: () => {},
    setTheme: () => {},
    density,
    setDensity,
  };
}
