import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ExamLayout } from '../ExamLayout.jsx';

describe('ExamLayout Component', () => {
  it('renders distraction-free wrapper without navbar or escape navigation', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/exam/123']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/exam/:id" element={<div data-testid="live-exam-content">Active Exam Interface</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Live exam content is rendered
    expect(screen.getByTestId('live-exam-content')).toBeInTheDocument();

    // No navbar or headers are present
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();

    // Contains distraction-free layout classes
    const outerWrapper = container.firstChild;
    expect(outerWrapper).toHaveClass('min-h-screen', 'bg-slate-900', 'select-none');
  });
});
