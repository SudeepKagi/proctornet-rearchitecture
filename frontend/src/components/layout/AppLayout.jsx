import React, { useMemo, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ClipboardList,
  FileCheck2,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  Monitor,
  ScrollText,
  Settings,
  Shield,
  Users,
  X,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { resolveWorkspace } from '../../routes/roleNavigation.js';
import { Navbar } from './Navbar.jsx';
import { Sheet, SheetContent } from '../ui/sheet.jsx';
import { cn } from '../../utils/cn.js';

const WORKSPACES = {
  student: {
    label: 'Student Portal',
    links: [
      { to: '/candidate', label: 'Dashboard & Exams', icon: LayoutDashboard },
      { to: '/candidate/biometrics/enroll', label: 'Identity & Verification', icon: Shield },
    ],
  },
  faculty: {
    label: 'Faculty Workspace',
    links: [
      { to: '/faculty', label: 'Dashboard & Exams', icon: LayoutDashboard },
      { to: '/faculty/question-banks', label: 'Question Bank', icon: BookOpen },
      { to: '/faculty/sessions', label: 'Schedules', icon: ClipboardList },
    ],
  },
  invigilator: {
    label: 'Invigilator Console',
    links: [
      { to: '/invigilator', label: 'Dashboard & Sessions', icon: Monitor },
    ],
  },
  admin: {
    label: 'Administration',
    links: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/verifications', label: 'Identity Verification', icon: FileCheck2 },
      { to: '/admin/audit', label: 'Audit Trail', icon: ScrollText },
      { to: '/admin/settings', label: 'System Settings', icon: Settings },
    ],
  },
  developer: {
    label: 'Developer Operations',
    links: [
      { to: '/developer/overview', label: 'Dashboard', icon: Gauge },
      { to: '/developer/health', label: 'System Health', icon: HeartPulse },
      { to: '/developer/logs', label: 'Live Logs', icon: ScrollText },
      { to: '/developer/audit', label: 'Security Audit', icon: Shield },
      { to: '/developer/topology', label: 'Topology Map', icon: Monitor },
      { to: '/developer/incidents', label: 'Chaos Incidents', icon: FileCheck2 },
    ],
  },
};

export function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const workspaceKey = useMemo(() => resolveWorkspace(location.pathname, user), [location.pathname, user]);
  const workspace = WORKSPACES[workspaceKey] || WORKSPACES.student;

  const roleLabel =
    user?.roles?.includes('ADMIN') && workspaceKey !== 'admin'
      ? `${workspace.label} view`
      : workspace.label;

  const NavLinks = ({ onLinkClick }) => (
    <nav className="flex flex-col space-y-1">
      {workspace.links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={
            to === '/candidate' ||
            to === '/faculty' ||
            to === '/invigilator' ||
            to === '/admin' ||
            to === '/developer/overview'
          }
          onClick={onLinkClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              isActive
                ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/60 dark:text-blue-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar onMenuToggle={() => setMobileMenuOpen(true)} />

      <div className="flex flex-1 pt-16">
        {/* Desktop Persistent Sidebar */}
        <aside
          className="hidden md:flex flex-col w-64 fixed top-16 bottom-0 left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 overflow-y-auto"
          aria-label={`${roleLabel} navigation`}
        >
          <div className="mb-4 px-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Workspace
            </span>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {roleLabel}
            </div>
          </div>

          <NavLinks />

          <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 px-2 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span>Academic Examination Office</span>
          </div>
        </aside>

        {/* Mobile Slide-Out Drawer (Sheet) */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" onClose={() => setMobileMenuOpen(false)} className="w-72 p-4">
            <div className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Workspace
              </span>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {roleLabel}
              </div>
            </div>
            <NavLinks onLinkClick={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main Workspace Content Area */}
        <main className="flex-1 md:pl-64 min-w-0">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
