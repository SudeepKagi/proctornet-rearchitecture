import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../src/pages/auth/LoginPage.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

describe('LoginPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form and submits credentials successfully', async () => {
    const mockLogin = vi.fn().mockResolvedValueOnce({
      user: { id: 'u1', name: 'Alice Student', roles: ['STUDENT'] },
      accessToken: 'jwt-token-123',
    });

    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: null,
            loading: false,
            isAuthenticated: false,
            login: mockLogin,
          }}
        >
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('Sign in to ProctorNet')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'alice@proctornet.edu' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'alice@proctornet.edu',
        password: 'password123',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/candidate', { replace: true });
    });
  });

  it('displays error message on invalid credentials', async () => {
    const mockLogin = vi.fn().mockRejectedValueOnce(new Error('Invalid email or password'));

    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: null,
            loading: false,
            isAuthenticated: false,
            login: mockLogin,
          }}
        >
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'wrong@proctornet.edu' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'wrongpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });
});
