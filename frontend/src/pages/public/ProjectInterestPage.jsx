/**
 * @file ProjectInterestPage.jsx
 * @description Academic project interest form allowing evaluators to follow technical milestones without commercial waitlist mechanics.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ProjectInterestPage() {
  usePageMeta({
    title: 'Project Updates & Technical Interest',
    description:
      'Subscribe to ProctorNet academic milestones, architecture whitepapers, and open-source project updates.',
    canonical: '/project-interest',
  });

  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [interestArea, setInterestArea] = useState('architecture');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please provide a valid email address.');
      return;
    }
    setError('');
    setIsSubmitting(true);

    setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('proctornet_project_interest') || '[]');
        stored.push({
          email,
          interestArea,
          notes,
          submittedAt: new Date().toISOString(),
        });
        localStorage.setItem('proctornet_project_interest', JSON.stringify(stored));
      } catch (err) {
        // Storage error
      }
      setIsSubmitting(false);
      navigate('/thank-you?type=interest');
    }, 400);
  };

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '640px' }}>
      <div style={{ marginBottom: '36px', textAlign: 'center' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Academic Updates
        </span>
        <h1
          style={{
            fontSize: 'clamp(2rem, 4vw, 2.5rem)',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '8px 0 12px 0',
          }}
        >
          Follow Project Milestones
        </h1>
        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Interested in reading our engineering technical reports or testing new open-source releases?
          Sign up for direct academic announcements.
        </p>
      </div>

      <div className="card-interactive" style={{ padding: '36px' }}>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label htmlFor="interest-email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Academic / Work Email Address *
            </label>
            <input
              id="interest-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. evaluator@university.edu"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.9375rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: error ? 'var(--color-danger)' : 'var(--color-border-medium)',
                backgroundColor: 'var(--color-canvas)',
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'interest-email-error' : undefined}
            />
            {error && (
              <span id="interest-email-error" style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: '4px', display: 'block' }}>
                {error}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="interest-area" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Primary Area of Interest
            </label>
            <select
              id="interest-area"
              value={interestArea}
              onChange={(e) => setInterestArea(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.9375rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-medium)',
                backgroundColor: 'var(--color-canvas)',
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
            >
              <option value="architecture">Modular Monolith &amp; Backend Engineering</option>
              <option value="screen-ai">Client-Side Screen AI &amp; Web Workers</option>
              <option value="webrtc">mediasoup SFU &amp; WebRTC Scalability</option>
              <option value="evaluation">Academic Capstone Evaluation</option>
            </select>
          </div>

          <div>
            <label htmlFor="interest-notes" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Comments or Questions (Optional)
            </label>
            <textarea
              id="interest-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tell us what aspects of the project you are most interested in..."
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.9375rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-medium)',
                backgroundColor: 'var(--color-canvas)',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-academic-primary"
            style={{ width: '100%', padding: '12px 20px', fontSize: '1rem', marginTop: '8px' }}
          >
            {isSubmitting ? 'Registering...' : 'Register Interest →'}
          </button>
        </form>
      </div>
    </div>
  );
}
