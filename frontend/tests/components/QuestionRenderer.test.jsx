import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionRenderer } from '../../src/components/exam/QuestionRenderer.jsx';

describe('QuestionRenderer Component', () => {
  it('renders single-select MCQ question options correctly', () => {
    const question = {
      id: 'q1',
      question_type: 'MCQ',
      prompt: 'What is the time complexity of binary search?',
      points: 2,
      options: [
        { id: 'opt-a', text: 'O(n)' },
        { id: 'opt-b', text: 'O(log n)' },
        { id: 'opt-c', text: 'O(1)' },
      ],
    };

    const handleChange = vi.fn();

    render(
      <QuestionRenderer
        question={question}
        questionNumber={1}
        value={{ selected_option_id: 'opt-b' }}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('What is the time complexity of binary search?')).toBeInTheDocument();
    expect(screen.getByText('2 marks')).toBeInTheDocument();

    const optB = screen.getByDisplayValue('opt-b');
    expect(optB).toBeChecked();

    const optA = screen.getByDisplayValue('opt-a');
    expect(optA).not.toBeChecked();

    fireEvent.click(optA);
    expect(handleChange).toHaveBeenCalledWith({ selected_option_id: 'opt-a' });
  });

  it('renders binary TRUE_FALSE radio cards correctly', () => {
    const question = {
      id: 'q2',
      question_type: 'TRUE_FALSE',
      prompt: 'PostgreSQL is a relational database.',
      points: 1,
      options: [
        { id: 'opt-true', text: 'True' },
        { id: 'opt-false', text: 'False' },
      ],
    };

    const handleChange = vi.fn();

    render(
      <QuestionRenderer
        question={question}
        questionNumber={2}
        value={{ selected_option_id: 'opt-true' }}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('PostgreSQL is a relational database.')).toBeInTheDocument();
    const trueRadio = screen.getByDisplayValue('opt-true');
    expect(trueRadio).toBeChecked();

    const falseRadio = screen.getByDisplayValue('opt-false');
    fireEvent.click(falseRadio);
    expect(handleChange).toHaveBeenCalledWith({ selected_option_id: 'opt-false' });
  });

  it('renders NUMERIC input and handles number changes', () => {
    const question = {
      id: 'q3',
      question_type: 'NUMERIC',
      prompt: 'What is the square root of 64?',
      points: 3,
    };

    const handleChange = vi.fn();

    render(
      <QuestionRenderer
        question={question}
        questionNumber={3}
        value={{ numeric_value: 8 }}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('What is the square root of 64?')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('e.g. 42.5');
    expect(input).toHaveValue(8);

    fireEvent.change(input, { target: { value: '9' } });
    expect(handleChange).toHaveBeenCalledWith({ numeric_value: 9 });

    fireEvent.change(input, { target: { value: '' } });
    expect(handleChange).toHaveBeenCalledWith({ numeric_value: null });
  });
});
