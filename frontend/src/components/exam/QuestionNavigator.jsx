/**
 * @file QuestionNavigator.jsx
 * @description Dynamic numbered jump palette rendering N questions with answered/current status indicators.
 */

import React from 'react';

export function QuestionNavigator({
  questions = [],
  currentIndex = 0,
  answers = {},
  onSelect,
}) {
  const total = questions.length;
  const answeredCount = questions.filter((q) => {
    const ans = answers[q.id];
    if (!ans) return false;
    if (ans.selected_option_id !== undefined && ans.selected_option_id !== null) return true;
    if (ans.numeric_value !== undefined && ans.numeric_value !== null && ans.numeric_value !== '') return true;
    return false;
  }).length;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Question Palette</h4>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
          {answeredCount} / {total} answered
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(38px, 1fr))',
          gap: '0.5rem',
          maxHeight: '320px',
          overflowY: 'auto',
          padding: '2px',
        }}
        role="navigation"
        aria-label="Question Navigator"
      >
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const ans = answers[q.id];
          const isAnswered =
            ans &&
            (ans.selected_option_id !== undefined && ans.selected_option_id !== null ||
              ans.numeric_value !== undefined && ans.numeric_value !== null && ans.numeric_value !== '');

          let bgColor = 'var(--color-surface)';
          let textColor = 'var(--color-text-body)';
          let borderColor = 'var(--color-border-subtle)';

          if (isAnswered) {
            bgColor = 'var(--color-success-light)';
            textColor = 'var(--color-success)';
            borderColor = 'var(--color-success-border)';
          }

          if (isCurrent) {
            borderColor = 'var(--color-primary)';
            if (!isAnswered) {
              bgColor = 'var(--color-primary-light)';
              textColor = 'var(--color-primary)';
            }
          }

          return (
            <button
              key={q.id || idx}
              type="button"
              onClick={() => onSelect(idx)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`Go to Question ${idx + 1}${isAnswered ? ', Answered' : ', Unanswered'}`}
              style={{
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                color: textColor,
                fontSize: '0.875rem',
                fontWeight: isCurrent ? 700 : 500,
                fontFamily: 'var(--font-family-mono)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '1.25rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--color-border-subtle)',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              backgroundColor: 'var(--color-success-light)',
              border: '1px solid var(--color-success-border)',
            }}
          />
          Answered
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
            }}
          />
          Unanswered
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              border: '2px solid var(--color-primary)',
            }}
          />
          Current
        </div>
      </div>
    </div>
  );
}
