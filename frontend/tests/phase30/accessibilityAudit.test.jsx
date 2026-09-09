/**
 * @file accessibilityAudit.test.jsx
 * @description Programmatic accessibility verification across public components.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicLayout } from '../../src/components/public/PublicLayout.jsx';
import { ContactPage } from '../../src/pages/public/ContactPage.jsx';
import { FaqPage } from '../../src/pages/public/FaqPage.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';

function renderInRouter(ui) {
  const mockAuth = {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={mockAuth}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Public Website Accessibility Conformance (WCAG 2.1 AA)', () => {
  it('includes an accessible skip-to-content link targeting #main-content', () => {
    renderInRouter(<PublicLayout />);
    const skipLink = screen.getByText(/Skip to main content/i);
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('renders essential semantic landmark regions', () => {
    renderInRouter(<PublicLayout />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Main Navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('verifies all interactive form inputs in ContactPage have associated labels', () => {
    renderInRouter(<ContactPage />);
    expect(screen.getByLabelText(/Full Name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Inquiry Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your Message \*/i)).toBeInTheDocument();
  });

  it('verifies FAQ accordion buttons possess aria-expanded and aria-controls attributes', () => {
    renderInRouter(<FaqPage />);
    const accordionButtons = screen.getAllByRole('button');
    const questionButtons = accordionButtons.filter((btn) => btn.getAttribute('aria-controls')?.startsWith('faq-answer-'));
    expect(questionButtons.length).toBeGreaterThan(0);

    questionButtons.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-expanded');
      expect(btn).toHaveAttribute('aria-controls');
    });
  });
});
