/**
 * @file RegisterPage.jsx
 * @description Candidate registration page for ProctorNet.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Input } from '../../components/common/Input.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('1');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name,
        email,
        password,
        phone: phone || undefined,
      };

      if (enrollmentNumber && department) {
        payload.student_profile = {
          enrollment_number: enrollmentNumber,
          department,
          semester: parseInt(semester, 10) || 1,
        };
      }

      await register(payload);
      setSuccessMsg('Registration successful! Redirecting to login...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      setError(err.message || 'Registration failed. Please review your input.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: 'var(--color-canvas)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              fontWeight: 700,
              fontSize: '1.25rem',
              marginBottom: '0.75rem',
            }}
          >
            PN
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Create an Account
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Register as a Candidate on ProctorNet
          </p>
        </div>

        <Card padding="spacious">
          {error && (
            <div
              role="alert"
              style={{
                marginBottom: '1.25rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-danger-light)',
                border: '1px solid var(--color-danger-border)',
                color: 'var(--color-danger)',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              style={{
                marginBottom: '1.25rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-success-light)',
                border: '1px solid var(--color-success-border)',
                color: 'var(--color-success)',
                fontSize: '0.875rem',
              }}
            >
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <Input
              id="name"
              label="Full Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              required
            />

            <Input
              id="email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane.doe@university.edu"
              autoComplete="email"
              required
            />

            <Input
              id="password"
              label="Password (min 8 characters)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />

            <Input
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Input
                id="enrollmentNumber"
                label="Enrollment ID"
                type="text"
                value={enrollmentNumber}
                onChange={(e) => setEnrollmentNumber(e.target.value)}
                placeholder="ENR-2026-001"
              />

              <Input
                id="department"
                label="Department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Computer Science"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              Register Account
            </Button>
          </form>

          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--color-border-subtle)',
              textAlign: 'center',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
            }}
          >
            Already have an account?{' '}
            <Link
              to="/login"
              style={{
                color: 'var(--color-primary)',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
