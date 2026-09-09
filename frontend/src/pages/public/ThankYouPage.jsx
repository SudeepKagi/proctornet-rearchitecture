/**
 * @file ThankYouPage.jsx
 * @description Contextual confirmation screen for contact, feedback, or update submissions.
 */

import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ThankYouPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'contact';

  usePageMeta({
    title: 'Thank You — Submission Received',
    description: 'Confirmation that your inquiry or project feedback was received by the ProctorNet team.',
    canonical: '/thank-you',
  });

  const getConfirmationDetails = () => {
    switch (type) {
      case 'interest':
        return {
          badge: 'Updates Registered',
          title: 'Thank You for Following ProctorNet!',
          message:
            'Your email has been recorded. You will receive notifications regarding new open-source releases, architectural whitepapers, and capstone presentation dates.',
        };
      case 'feedback':
        return {
          badge: 'Evaluation Recorded',
          title: 'Thank You for Your Feedback!',
          message:
            'Your evaluator commentary and testing observations have been recorded. Academic reviews help us continuously refine the platform architecture and codebase.',
        };
      default:
        return {
          badge: 'Message Received',
          title: 'Thank You for Reaching Out!',
          message:
            'Your inquiry has been delivered to the student project maintainers. We will review your message and reply to your provided email address shortly.',
        };
    }
  };

  const details = getConfirmationDetails();

  return (
    <div className="container" style={{ paddingTop: '80px', paddingBottom: '100px', maxWidth: '640px', textAlign: 'center' }}>
      <div className="card-interactive" style={{ padding: '48px 36px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-success-light)',
            border: '2px solid var(--color-success-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            margin: '0 auto 20px auto',
          }}
        >
          ✓
        </div>

        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          {details.badge}
        </span>

        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '8px 0 16px 0',
          }}
        >
          {details.title}
        </h1>

        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--color-text-muted)', marginBottom: '32px' }}>
          {details.message}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
          <Link to="/" className="btn-academic-primary" style={{ padding: '10px 20px' }}>
            Return to Home
          </Link>
          <Link to="/architecture" className="btn-academic-secondary" style={{ padding: '10px 20px' }}>
            Explore Architecture
          </Link>
          <Link to="/documentation" className="btn-academic-ghost" style={{ padding: '10px 16px' }}>
            Read Technical Docs
          </Link>
        </div>
      </div>
    </div>
  );
}
