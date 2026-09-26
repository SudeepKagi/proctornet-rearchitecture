/**
 * @file main.jsx
 * @description React DOM root bootstrap.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary.jsx';
import { ToastProvider } from './components/ui/toast.jsx';
import { App } from './App.jsx';
import './styles/global.css';

// Guard against React 19's estimateBandwidth issue where resource entries
// with undefined values or holes cause `Cannot read properties of undefined (reading 'startTime')`
if (typeof window !== 'undefined' && window.performance && typeof window.performance.getEntriesByType === 'function') {
  const origGetEntriesByType = window.performance.getEntriesByType.bind(window.performance);
  window.performance.getEntriesByType = function (type) {
    const entries = origGetEntriesByType(type);
    if (type === 'resource' && Array.isArray(entries)) {
      return entries.filter((entry) => Boolean(entry && typeof entry.startTime === 'number'));
    }
    return entries;
  };
}

// Enforce light theme only and clear any stale dark mode attributes/tokens
if (typeof document !== 'undefined') {
  try {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } catch {
    // Ignore localStorage restrictions if any
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </GlobalErrorBoundary>
  </React.StrictMode>
);
