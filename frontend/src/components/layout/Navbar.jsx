import React from 'react';
import { Link } from 'react-router-dom';
import {
  LogOut,
  Menu,
  ShieldCheck,
  Moon,
  Sun,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useTheme } from '../../hooks/useTheme.js';
import { Button } from '../ui/button.jsx';
import { Avatar } from '../ui/avatar.jsx';
import { Badge } from '../ui/badge.jsx';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu.jsx';

export function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, density, setDensity } = useTheme();

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

  const isVerified = user?.verificationStatus === 'VERIFIED';
  const role = user?.roles?.[0] || 'User';

  return (
    <header className="app-topbar bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 h-16 flex items-center gap-3 transition-colors">
      <button
        className="app-menu-button md:hidden p-2 rounded-md text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        type="button"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
      >
        <Menu size={20} />
      </button>

      <Link
        className="app-brand flex items-center gap-2.5 text-slate-900 dark:text-slate-50 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md p-1"
        to="/dashboard"
        aria-label="ProctorNet dashboard home"
      >
        <span className="app-brand-mark flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-xs">
          <ShieldCheck size={18} />
        </span>
        <div className="flex flex-col">
          <span className="text-base font-bold leading-none tracking-tight">ProctorNet</span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Academic Platform</span>
        </div>
      </Link>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="h-8 w-8 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </Button>

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
                  {role}
                </span>
              </div>
              <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 hidden sm:inline" />
            </button>
          }
        >
          {({ close }) => (
            <>
              <DropdownMenuLabel>
                <div className="font-medium text-slate-900 dark:text-slate-100">{user?.name}</div>
                <div className="text-[11px] text-slate-500 truncate font-normal">{user?.email}</div>
              </DropdownMenuLabel>
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
