import React from 'react';
import { Outlet } from 'react-router-dom';

// Developer navigation lives in the shared application sidebar. Keeping this
// layout as an outlet prevents a second, conflicting tab bar on every screen.
export function DeveloperLayout() {
  return <Outlet />;
}
