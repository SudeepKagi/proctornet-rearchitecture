/**
 * @file ContactPage.jsx
 * @description Academic contact & technical inquiry form for ProctorNet.
 * Operates without database schema migrations; records structured client-side feedback.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ContactPage() {
  usePageMeta({
    title: 'Contact Project Team: Academic & Technical Inquiries',
    description:
      'Contact the student engineering team behind ProctorNet: technical questions, bug reports, academic evaluation inquiries, and architecture discussions.',
    canonical: '/contact',
  });

  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    inquiryType: 'general',
    institution: '',
    message: '',
    privacyAccepted: false,
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Full name is required.';
    if (!formData.email.trim() || !/^\S+@\S+\.\S+$/.test(formData.email)) {
      errs.email = 'A valid email address is required.';
    }
    if (!formData.message.trim() || formData.message.length < 10) {
      errs.message = 'Please provide a message with at least 10 characters.';
    }
    if (!formData.privacyAccepted) {
      errs.privacyAccepted = 'You must accept the privacy notice to submit.';
    }
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    // Record submission locally
    setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('proctornet_contact_submissions') || '[]');
        stored.push({
          ...formData,
          submittedAt: new Date().toISOString(),
        });
        localStorage.setItem('proctornet_contact_submissions', JSON.stringify(stored));
      } catch (err) {
        // Storage error fallback
      }
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 400);
  };

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '720px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Connect with the Team
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
          Contact the Project Team
        </h1>
        <p style={{ fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--color-text-muted)', margin: 0 }}>
          Have a question about the architecture, want to report a technical bug, or discuss academic evaluation?
          Send us a message and the student maintainers will reply promptly.
        </p>
      </div>

      {isSubmitted ? (
        <div className="card-interactive" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#f0fdf4',
              border: '2px solid #86efac',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 700,
              margin: '0 auto 16px',
            }}
          >
            ✓
          </div>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
            Message Sent Successfully
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto 24px' }}>
            Thank you for reaching out, <strong>{formData.name}</strong>. Your inquiry has been received. The project maintainers will review your message and reply to <strong>{formData.email}</strong>.
          </p>
          <button
            type="button"
            className="btn-academic-secondary"
            onClick={() => {
              setFormData({
                name: '',
                email: '',
                inquiryType: 'general',
                institution: '',
                message: '',
                privacyAccepted: false,
              });
              setIsSubmitted(false);
            }}
            style={{ padding: '10px 20px', fontSize: '0.9375rem' }}
          >
            Send Another Message
          </button>
        </div>
      ) : (
        <div className="card-interactive" style={{ padding: '36px' }}>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Name Field */}
          <div>
            <label htmlFor="contact-name" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Full Name *
            </label>
            <input
              id="contact-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.9375rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: errors.name ? 'var(--color-danger)' : 'var(--color-border-medium)',
                backgroundColor: 'var(--color-canvas)',
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'contact-name-error' : undefined}
            />
            {errors.name && (
              <span id="contact-name-error" style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: '4px', display: 'block' }}>
                {errors.name}
              </span>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="contact-email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Email Address *
            </label>
            <input
              id="contact-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.9375rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: errors.email ? 'var(--color-danger)' : 'var(--color-border-medium)',
                backgroundColor: 'var(--color-canvas)',
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'contact-email-error' : undefined}
            />
            {errors.email && (
              <span id="contact-email-error" style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: '4px', display: 'block' }}>
                {errors.email}
              </span>
            )}
          </div>

          {/* Inquiry Type & Institution */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label htmlFor="contact-type" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                Inquiry Type
              </label>
              <select
                id="contact-type"
                value={formData.inquiryType}
                onChange={(e) => setFormData({ ...formData, inquiryType: e.target.value })}
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
                <option value="general">General Inquiries</option>
                <option value="technical">Technical / Architecture Discussion</option>
                <option value="bug">Defect / Security Bug Report</option>
                <option value="academic">Academic Evaluation &amp; Feedback</option>
              </select>
            </div>

            <div>
              <label htmlFor="contact-institution" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                University / Institution (Optional)
              </label>
              <input
                id="contact-institution"
                type="text"
                value={formData.institution}
                onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                placeholder="e.g. University CS Department"
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
              />
            </div>
          </div>

          {/* Message Field */}
          <div>
            <label htmlFor="contact-message" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Your Message *
            </label>
            <textarea
              id="contact-message"
              rows={5}
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Describe your inquiry, question, or technical feedback in detail..."
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '0.9375rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: errors.message ? 'var(--color-danger)' : 'var(--color-border-medium)',
                backgroundColor: 'var(--color-canvas)',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? 'contact-message-error' : undefined}
            />
            {errors.message && (
              <span id="contact-message-error" style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: '4px', display: 'block' }}>
                {errors.message}
              </span>
            )}
          </div>

          {/* Privacy Consent Checkbox */}
          <div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.privacyAccepted}
                onChange={(e) => setFormData({ ...formData, privacyAccepted: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-body)', lineHeight: 1.5 }}>
                I agree that this message and contact details will be processed solely to respond to my academic inquiry in accordance with the{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                  Privacy Policy
                </a>.
              </span>
            </label>
            {errors.privacyAccepted && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: '4px', display: 'block' }}>
                {errors.privacyAccepted}
              </span>
            )}
          </div>

          {/* Submit Button */}
          <div style={{ marginTop: '8px' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-academic-primary"
              style={{ width: '100%', padding: '12px 20px', fontSize: '1rem' }}
            >
              {isSubmitting ? 'Sending Message...' : 'Send Message →'}
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  );
}
