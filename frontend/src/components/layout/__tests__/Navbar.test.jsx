import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../Navbar.jsx';
import * as authHook from '../../../hooks/useAuth.js';
import * as themeHook from '../../../hooks/useTheme.js';

describe('Navbar Component', () => {
  const mockLogout = vi.fn();
  const mockSetDensity = vi.fn();
  const mockOnMenuToggle = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(themeHook, 'useTheme').mockReturnValue({
      density: 'comfortable',
      setDensity: mockSetDensity,
      isDark: false,
    });
  });

  it('renders nothing when auth is loading or user is not loaded', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: null,
      loading: true,
      logout: mockLogout,
    });

    const { container } = render(
      <MemoryRouter>
        <Navbar onMenuToggle={mockOnMenuToggle} />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders brand mark, role-specific nav links for STUDENT, and verified badge', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: {
        userId: 'student-1',
        name: 'Jane Doe',
        email: 'jane@institution.edu',
        roles: ['STUDENT'],
        verificationStatus: 'VERIFIED',
      },
      loading: false,
      logout: mockLogout,
    });

    render(
      <MemoryRouter>
        <Navbar onMenuToggle={mockOnMenuToggle} />
      </MemoryRouter>
    );

    // Brand link points to student home
    const brandLink = screen.getByRole('link', { name: /proctornet portal home/i });
    expect(brandLink).toHaveAttribute('href', '/candidate');

    // Desktop nav items for student
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    const myExamsLink = screen.getByRole('link', { name: 'My Exams' });
    const resultsLink = screen.getByRole('link', { name: 'Results' });

    expect(dashboardLink).toHaveAttribute('href', '/candidate');
    expect(myExamsLink).toHaveAttribute('href', '/candidate/exams');
    expect(resultsLink).toHaveAttribute('href', '/candidate/results');

    // Verified badge check
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders pending review status when student verification is pending', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: {
        userId: 'student-2',
        name: 'Bob Pending',
        email: 'bob@institution.edu',
        roles: ['STUDENT'],
        verificationStatus: 'PENDING_REVIEW',
      },
      loading: false,
      logout: mockLogout,
    });

    render(
      <MemoryRouter>
        <Navbar onMenuToggle={mockOnMenuToggle} />
      </MemoryRouter>
    );

    // Initial avatar letters
    expect(screen.getByText('BP')).toBeInTheDocument();
  });

  it('handles user menu dropdown, density toggle, and sign out', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: {
        userId: 'student-1',
        name: 'Jane Doe',
        email: 'jane@institution.edu',
        roles: ['STUDENT'],
        verificationStatus: 'VERIFIED',
      },
      loading: false,
      logout: mockLogout,
    });

    render(
      <MemoryRouter>
        <Navbar onMenuToggle={mockOnMenuToggle} />
      </MemoryRouter>
    );

    // Open user menu
    const menuTrigger = screen.getByRole('button', { name: /user profile settings menu/i });
    fireEvent.click(menuTrigger);

    // Dropdown contains Profile link and Sign out button
    expect(screen.getByText('Profile & Account')).toBeInTheDocument();
    const signOutBtn = screen.getByText('Sign out');
    expect(signOutBtn).toBeInTheDocument();

    // Click density button
    const compactBtn = screen.getByRole('button', { name: /compact/i });
    fireEvent.click(compactBtn);
    expect(mockSetDensity).toHaveBeenCalledWith('compact');

    // Click sign out
    fireEvent.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
