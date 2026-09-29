import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  ChevronDown,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useTheme } from '../../hooks/useTheme.js';
import { Avatar } from '../ui/avatar.jsx';
import { Badge } from '../ui/badge.jsx';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu.jsx';
import { cn } from '../../utils/cn.js';

const ROLE_NAV_ITEMS = {
  STUDENT: [
    { to: '/candidate', label: 'Dashboard', end: true },
    { to: '/candidate/exams', label: 'My Exams' },
    { to: '/candidate/results', label: 'Results' },
  ],
  FACULTY: [
    { to: '/faculty', label: 'Dashboard', end: true },
    { to: '/faculty/exams', label: 'Exams' },
    { to: '/faculty/question-pools', label: 'Question Pools' },
    { to: '/invigilator', label: 'Live Invigilation' },
  ],
  INVIGILATOR: [
    { to: '/invigilator', label: 'Dashboard', end: true },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/verifications', label: 'Verifications' },
  ],
};

export function Navbar({ onMenuToggle }) {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const { density, setDensity } = useTheme();

  // Guard: Render nothing until user is completely loaded
  if (loading || !user) {
    return null;
  }

  async function handleLogout() {
    await logout();
  }

  const initials = (user?.name || user?.email || 'U')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const primaryRole = user?.roles?.[0] || 'STUDENT';
  const navLinks = ROLE_NAV_ITEMS[primaryRole] || ROLE_NAV_ITEMS.STUDENT;

  const brandDestination = user?.roles?.includes('STUDENT')
    ? '/candidate'
    : user?.roles?.includes('FACULTY')
    ? '/faculty'
    : user?.roles?.includes('ADMIN')
    ? '/admin'
    : user?.roles?.includes('INVIGILATOR')
    ? '/invigilator'
    : '/dashboard';

  const verificationStatus = user?.verificationStatus || user?.verification_status || 'PENDING';
  const isVerified = verificationStatus === 'VERIFIED';
  const isPendingReview = verificationStatus === 'PENDING_REVIEW' || verificationStatus === 'PENDING';
  const isRejected = verificationStatus === 'REJECTED';

  const badgeConfig = isVerified
    ? { variant: 'success', label: 'Verified' }
    : isRejected
    ? { variant: 'destructive', label: 'Rejected' }
    : { variant: 'secondary', label: 'Pending Review' };

  return (
    <header className="fixed top-0 inset-x-0 h-16 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center gap-3 transition-colors shadow-2xs">
      <button
        className="md:hidden p-2 rounded-md text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        type="button"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
      >
        <Menu size={20} />
      </button>

      <Link
        className="app-brand flex items-center gap-2.5 text-slate-900 dark:text-slate-50 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md p-1 shrink-0"
        to={brandDestination}
        aria-label="ProctorNet portal home"
      >
        <span className="app-brand-mark flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-xs">
          <ShieldCheck size={18} />
        </span>
        <div className="flex flex-col">
          <span className="text-base font-bold leading-none tracking-tight">ProctorNet</span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Academic Platform</span>
        </div>
      </Link>

      {/* Role-based Desktop Navigation Links */}
      <nav className="hidden md:flex items-center gap-1 ml-4 sm:ml-6" aria-label="Main navigation">
        {navLinks.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 select-none',
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/70 dark:text-blue-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* User Dropdown Profile & Controls */}
        <DropdownMenu
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="User profile settings menu"
            >
              <Avatar className="h-8 w-8 text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {initials}
              </Avatar>
              <div className="hidden sm:flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[120px] truncate">
                    {user?.name || 'User'}
                  </span>
                  {isVerified && (
                    <Badge variant="success" size="sm" className="px-1 py-0 text-[9px] leading-tight">
                      ✓
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {primaryRole}
                </span>
              </div>
              <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 hidden sm:inline" />
            </button>
          }
        >
          {({ close }) => (
            <>
              <DropdownMenuLabel>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user?.name}
                  </span>
                  <Badge variant={badgeConfig.variant} size="sm" className="text-[10px] px-1.5 py-0">
                    {badgeConfig.label}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-500 truncate font-normal mt-0.5">{user?.email}</div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Profile Link */}
              <DropdownMenuItem
                icon={UserCircle}
                onClick={() => {
                  close();
                  navigate('/candidate/profile');
                }}
              >
                Profile & Account
              </DropdownMenuItem>

              {user?.roles?.includes('ADMIN') && (
                <DropdownMenuItem
                  icon={ShieldCheck}
                  onClick={() => {
                    close();
                    navigate('/admin');
                  }}
                >
                  Admin Console
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuLabel>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <SlidersHorizontal size={13} />
                  <span>Display Density</span>
                </div>
              </DropdownMenuLabel>
              <div className="px-2 py-1 grid grid-cols-3 gap-1">
                {['compact', 'comfortable', 'touch'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDensity(d);
                    }}
                    className={`text-[11px] py-1 px-1.5 rounded-sm capitalize font-medium transition-colors cursor-pointer ${
                      density === d
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                icon={LogOut}
                onClick={() => {
                  close();
                  handleLogout();
                }}
              >
                Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenu>
      </div>
    </header>
  );
}
