/**
 * @file publicNavigation.test.jsx
 * @description Integration tests for public educational website routing and navigation.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';

// Mock Auth Provider to simulate unauthenticated visitor
function renderWithRouter(initialEntry = '/') {
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
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Public Educational Website Routing & Navigation', () => {
  it('renders the LandingPage on root ("/") with academic capstone badge and positioning', () => {
    renderWithRouter('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/An Open, Resilient Architecture/i);
    expect(screen.getByText(/Academic Capstone Project • Non-Commercial Software Engineering Demo/i)).toBeInTheDocument();
    expect(screen.getByText(/The Four Pillars of ProctorNet/i)).toBeInTheDocument();
  });

  it('renders the AboutPage on "/about" with problem space and limitations', () => {
    renderWithRouter('/about');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Engineering Ethical Online Assessments/i);
    expect(screen.getByText(/1. The Problem Space in Remote Examinations/i)).toBeInTheDocument();
    expect(screen.getByText(/3. Explicit Academic Limitations/i)).toBeInTheDocument();
  });

  it('renders the FeaturesPage on "/features" with capability catalog', () => {
    renderWithRouter('/features');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Comprehensive Engineering Capabilities/i);
    expect(screen.getByRole('tab', { name: /Examination Engine & Lifecycle/i })).toBeInTheDocument();
  });

  it('renders the HowItWorksPage on "/how-it-works" with 5-stage lifecycle', () => {
    renderWithRouter('/how-it-works');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/How ProctorNet Delivers Secure Exams/i);
    expect(screen.getByText(/Blueprint Authoring & Question Banks/i)).toBeInTheDocument();
    expect(screen.getByText(/Atomic Evaluation, Manual Grading & Publication/i)).toBeInTheDocument();
  });

  it('renders the ArchitecturePage on "/architecture" with SVG diagrams selector', () => {
    renderWithRouter('/architecture');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/System Architecture Walkthrough/i);
    expect(screen.getByText(/1. System Topology/i)).toBeInTheDocument();
    expect(screen.getByText(/4. Security & WireGuard Perimeter/i)).toBeInTheDocument();
  });

  it('renders the DocumentationHubPage on "/documentation"', () => {
    renderWithRouter('/documentation');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Engineering Documentation Hub/i);
    expect(screen.getByText(/1. Architecture & Design Specifications/i)).toBeInTheDocument();
  });

  it('renders the FaqPage on "/faq" with categorized questions', () => {
    renderWithRouter('/faq');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Frequently Asked Questions/i);
    expect(screen.getByText(/Is ProctorNet a commercial product or enterprise service\?/i)).toBeInTheDocument();
  });

  it('renders the ContactPage on "/contact"', () => {
    renderWithRouter('/contact');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Contact the Project Team/i);
    expect(screen.getByLabelText(/Full Name \*/i)).toBeInTheDocument();
  });

  it('renders the PrivacyPage on "/privacy" with data inventory table', () => {
    renderWithRouter('/privacy');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Privacy Policy/i);
    expect(screen.getByText(/1. Authoritative Data Flow & Storage Inventory/i)).toBeInTheDocument();
    expect(screen.getByText(/Biometric Identity Data/i)).toBeInTheDocument();
  });

  it('renders the CookiesPage on "/cookies" with consent toggles', () => {
    renderWithRouter('/cookies');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Cookie Policy/i);
    expect(screen.getByText(/Strictly Essential Cookies/i)).toBeInTheDocument();
  });

  it('renders PublicNotFoundPage on unknown route ("*")', () => {
    renderWithRouter('/non-existent-page-path-123');
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Page Not Found/i);
    expect(screen.getByText(/Return to Home/i)).toBeInTheDocument();
  });
});
