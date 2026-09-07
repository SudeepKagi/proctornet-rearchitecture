import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutosaveIndicator } from '../../src/components/exam/AutosaveIndicator.jsx';

describe('AutosaveIndicator Component', () => {
  it('renders "All changes saved" on idle / saved status', () => {
    render(<AutosaveIndicator status="saved" />);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('renders "Saving..." during dispatch', () => {
    render(<AutosaveIndicator status="saving" />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('renders "Offline — changes queued" on failure', () => {
    render(<AutosaveIndicator status="offline" />);
    expect(screen.getByText('Offline — changes queued')).toBeInTheDocument();
  });
});
