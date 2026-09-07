/**
 * @file QuestionRenderer.jsx
 * @description Accessible question renderer supporting MCQ, True/False, and Numeric questions.
 */

import React from 'react';

export function QuestionRenderer({
  question,
  questionNumber,
  value,
  onChange,
  disabled = false,
}) {
  if (!question) return null;

  const { question_type, prompt, options = [], points = 1 } = question;

  const currentOptionId = value?.selected_option_id || null;
  const currentNumericValue = value?.numeric_value !== undefined ? value.numeric_value : '';

  function handleOptionSelect(optionId) {
    if (disabled) return;
    onChange({
      selected_option_id: optionId,
    });
  }

  function handleNumericChange(e) {
    if (disabled) return;
    const val = e.target.value;
    onChange({
      numeric_value: val === '' ? null : Number(val),
    });
  }

  return (
    <fieldset
      style={{
        border: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      <legend
        style={{
          display: 'block',
          width: '100%',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-primary)',
            }}
          >
            Question {questionNumber}
          </span>
          <span
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-text-muted)',
              backgroundColor: 'var(--color-surface-secondary)',
              padding: '0.125rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {points} {points === 1 ? 'mark' : 'marks'}
          </span>
        </div>

        <div
          style={{
            fontSize: '1.125rem',
            lineHeight: 1.6,
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}
        >
          {prompt}
        </div>
      </legend>

      {/* Multiple Choice Options */}
      {question_type === 'MCQ' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {options.map((opt, idx) => {
            const isSelected = currentOptionId === opt.id;
            const letter = String.fromCharCode(65 + idx); // A, B, C, D...

            return (
              <label
                key={opt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border-subtle)'}`,
                  backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'border-color var(--transition-fast), background-color var(--transition-fast)',
                }}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={opt.id}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => handleOptionSelect(opt.id)}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: 'var(--color-primary)',
                  }}
                />
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
                    color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-body)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {letter}
                </span>
                <span
                  style={{
                    fontSize: '0.9375rem',
                    color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-body)',
                    fontWeight: isSelected ? 500 : 400,
                  }}
                >
                  {opt.text}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* True / False Options */}
      {question_type === 'TRUE_FALSE' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {options.length > 0 ? (
            options.map((opt) => {
              const isSelected = currentOptionId === opt.id;
              return (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border-subtle)'}`,
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: isSelected ? 600 : 500,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={opt.id}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => handleOptionSelect(opt.id)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
                  />
                  <span>{opt.text}</span>
                </label>
              );
            })
          ) : (
            // Fallback if options array is not explicitly expanded
            ['True', 'False'].map((label) => {
              const isSelected = currentOptionId === label.toLowerCase();
              return (
                <label
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border-subtle)'}`,
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: isSelected ? 600 : 500,
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={label.toLowerCase()}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => handleOptionSelect(label.toLowerCase())}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
                  />
                  <span>{label}</span>
                </label>
              );
            })
          )}
        </div>
      )}

      {/* Numeric Input */}
      {question_type === 'NUMERIC' && (
        <div style={{ maxWidth: '320px' }}>
          <label
            htmlFor={`numeric-${question.id}`}
            style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)' }}
          >
            Enter your numeric response:
          </label>
          <input
            id={`numeric-${question.id}`}
            type="number"
            step="any"
            value={currentNumericValue}
            onChange={handleNumericChange}
            disabled={disabled}
            placeholder="e.g. 42.5"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontSize: '1.125rem',
              fontWeight: 500,
              fontFamily: 'var(--font-family-mono)',
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--color-border-subtle)',
              backgroundColor: disabled ? 'var(--color-surface-secondary)' : 'var(--color-surface)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      )}
    </fieldset>
  );
}
