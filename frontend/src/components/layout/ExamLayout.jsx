/**
 * @file ExamLayout.jsx
 * @description Dedicated distraction-free layout for live exam taking.
 * Completely strips out navigation headers, sidebar, brand navigation, and escape routes.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';

export function ExamLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col select-none">
      <main className="flex-1 flex flex-col w-full h-full">
        <Outlet />
      </main>
    </div>
  );
}
