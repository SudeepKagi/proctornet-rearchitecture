/**
 * @file PublicNavbar.jsx
 * @description Clean, academic navigation header for ProctorNet Online Examination System.
 * Max 4-5 focused navigation items, clear hierarchy, accessible mobile menu, and prominent Sign In CTA.
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { BookOpen, User, ArrowRight, Menu, X } from 'lucide-react';

export function PublicNavbar() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (location.pathname === '/about') {
      setActiveSection('about');
    } else if (location.hash) {
      setActiveSection(location.hash.replace('#', ''));
    } else if (location.pathname === '/') {
      setActiveSection('home');
    } else {
      setActiveSection('');
    }
  }, [location.pathname, location.hash]);

  const getDashboardRoute = () => {
    if (!user) return '/login';
    if (user.roles?.includes('ADMIN')) return '/admin';
    if (user.roles?.includes('DEVELOPER')) return '/developer/overview';
    if (user.roles?.includes('FACULTY')) return '/faculty';
    return '/candidate';
  };

  const navItems = [
    { label: 'Home', href: '/', isHash: false },
    { label: 'About', href: '/about', isHash: false },
    { label: 'How It Works', href: '/#how-it-works', isHash: true, id: 'how-it-works' },
    { label: 'FAQ', href: '/#faq', isHash: true, id: 'faq' },
  ];

  const handleNavClick = (item) => {
    setIsMenuOpen(false);
    if (item.isHash) {
      if (location.pathname === '/') {
        const el = document.getElementById(item.id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          setActiveSection(item.id);
        }
      }
    } else if (item.href === '/' && location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setActiveSection('home');
    }
  };

  return (
    <header
      role="banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
      }}
    >
      <div
        className="public-nav-inner"
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 clamp(1rem, 3vw, 2rem)',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
        }}
      >
        {/* Brand Logo & Name */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            textDecoration: 'none',
            flexShrink: 0,
          }}
          aria-label="ProctorNet Home"
          onClick={() => {
            if (location.pathname === '/') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '34px',
              height: '34px',
              borderRadius: '7px',
              backgroundColor: '#1d4ed8',
              color: '#ffffff',
            }}
          >
            <BookOpen size={18} strokeWidth={2.2} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: '1.1875rem',
                letterSpacing: '-0.02em',
                color: '#0f172a',
                lineHeight: 1.15,
              }}
            >
              Proctor<span style={{ color: '#1d4ed8' }}>Net</span>
            </span>
            <span
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: '#64748b',
                letterSpacing: '0.01em',
              }}
            >
              Online Examination System
            </span>
          </div>
        </Link>

        {/* Center Navigation Links (Max 4 items) */}
        <button
          type="button"
          className="public-nav-menu-toggle"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMenuOpen}
          aria-controls="public-primary-navigation"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav
          id="public-primary-navigation"
          className={`public-nav-links${isMenuOpen ? ' is-open' : ''}`}
          role="navigation"
          aria-label="Main Navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(0.5rem, 1.5vw, 1.5rem)',
          }}
        >
          {navItems.map((item) => {
            const itemKey = item.isHash ? item.id : item.href === '/' ? 'home' : item.href.replace('/', '');
            const isActive = activeSection === itemKey;

            const linkStyle = {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '0.875rem',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#1d4ed8' : '#334155',
              textDecoration: 'none',
              padding: '6px 10px',
              borderRadius: '6px',
              transition: 'color 0.15s ease, background-color 0.15s ease',
            };

            return item.isHash ? (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => {
                  if (location.pathname === '/') {
                    e.preventDefault();
                    handleNavClick(item);
                  } else {
                    setIsMenuOpen(false);
                  }
                }}
                style={linkStyle}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#0f172a';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#334155';
                }}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.href}
                style={linkStyle}
                onClick={() => handleNavClick(item)}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#0f172a';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#334155';
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Sign In / Portal CTA Button */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {!isAuthenticated ? (
            <Link
              to="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: '#1d4ed8',
                borderRadius: '6px',
                textDecoration: 'none',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e40af')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            >
              <span>Login</span>
              <ArrowRight size={14} />
            </Link>
          ) : (
            <Link
              to={getDashboardRoute()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: '#1d4ed8',
                borderRadius: '6px',
                textDecoration: 'none',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e40af')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            >
              <User size={15} />
              <span>Dashboard</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
