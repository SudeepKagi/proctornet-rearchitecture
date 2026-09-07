import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionNavigator } from '../../src/components/exam/QuestionNavigator.jsx';

describe('QuestionNavigator Component', () => {
  it('dynamically renders N buttons based on questions array length', () => {
    const questions = [
      { id: 'q1' },
      { id: 'q2' },
      { id: 'q3' },
      { id: 'q4' },
      { id: 'q5' },
    ];
    const answers = {
      q1: { selected_option_id: 'opt-a' },
      q2: { numeric_value: 42 },
    };

    const handleSelect = vi.fn();

    render(
      <QuestionNavigator
        questions={questions}
        currentIndex={0}
        answers={answers}
        onSelect={handleSelect}
      />
    );

    expect(screen.getByText('2 / 5 answered')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);

    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(buttons[0]).toHaveTextContent('1');

    fireEvent.click(buttons[3]);
    expect(handleSelect).toHaveBeenCalledWith(3);
  });
});
